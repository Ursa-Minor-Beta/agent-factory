import type { ExecutedToolCall } from './types.js';
import type { ToolDefinition, ClientToolDefinition } from '../../tools/index.js';
import type { ExecutionOptions } from '../base.js';
import { getBuiltinTool } from '../../tools/index.js';
import { executeBuiltinTool } from './builtin-tools/index.js';
import { executeSubAgent } from './sub-agent.js';
import { TOOL_RESULT_TRUNCATE_LENGTH } from './constants.js';
import { NodeExecutionError } from '../../../utils/errors.js';

/**
 * Resolve tool definitions by looking up builtin tools from the registry.
 * Builtin tools specified without parameters will get their full definition.
 */
export function resolveTools(
  tools: ToolDefinition[] | undefined,
  clientTools?: ClientToolDefinition[],
  nodeId?: string
): ToolDefinition[] | undefined {
  const nodeClientTools = clientTools?.filter((t) => !t.nodeIds || (nodeId !== undefined && t.nodeIds.includes(nodeId)));
  if (!tools && !nodeClientTools?.length) return undefined;

  const resolved = (tools ?? []).map((tool) => {
    if (tool.type === 'builtin') {
      const builtinDef = getBuiltinTool(tool.name);
      if (builtinDef) {
        // Return the full builtin definition with parameters
        return builtinDef as ToolDefinition;
      }
      // If not found in registry, return as-is (will fail later with better error)
    }
    return tool;
  });

  // Client tools come from the request (not the node), appended after the node's own tools
  return [...resolved, ...(nodeClientTools ?? [])];
}

/**
 * Execute a client tool by forwarding the call to the client (UI) and waiting for its result
 */
export async function executeClientTool(
  toolCallId: string,
  name: string,
  args: Record<string, unknown>,
  options: ExecutionOptions
): Promise<unknown> {
  if (!options.requestClientTool) {
    throw new Error(`Client tool "${name}" is not available: no client attached to this run`);
  }
  return options.requestClientTool({ toolCallId, name, args });
}

/**
 * Execute a server tool (builtin / sub-agent), emitting started/completed/failed tool call events.
 * A result shaped like { error } counts as failed, same as a thrown error (which is rethrown).
 */
export async function executeServerTool(
  toolCallId: string,
  toolDef: ToolDefinition,
  args: Record<string, unknown>,
  options: ExecutionOptions,
  nodeId: string
): Promise<unknown> {
  const base = {
    toolCallId,
    name: toolDef.name,
    toolType: toolDef.type === 'builtin' ? 'builtin' as const : 'agent' as const,
    nodeId,
    path: [...(options.subAgentPath ?? []), nodeId],
  };
  const startedAt = Date.now();
  options.onToolCallEvent?.({ ...base, status: 'started' });

  try {
    const result = toolDef.type === 'builtin'
      ? await executeBuiltinTool(toolDef.name, args, options)
      : await executeSubAgent(toolDef.agentId!, args, options, nodeId, toolDef.name);

    const resultError = typeof result === 'object' && result !== null && 'error' in result
      ? String((result as { error: unknown }).error)
      : undefined;
    options.onToolCallEvent?.({
      ...base,
      status: resultError ? 'failed' : 'completed',
      ...(resultError ? { error: resultError } : {}),
      durationMs: Date.now() - startedAt,
    });
    return result;
  }
  catch (error) {
    options.onToolCallEvent?.({
      ...base,
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startedAt,
    });
    throw error;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Deep-merge node extraParams into a provider request body.
 * Plain objects merge recursively, other values replace, null removes the key
 * (e.g. { temperature: null } for reasoning models that reject it).
 */
export function applyExtraParams<T extends object>(body: T, extraParams: Record<string, unknown> | undefined): T {
  if (!extraParams) return body;

  const result: Record<string, unknown> = { ...(body as Record<string, unknown>) };
  for (const [key, value] of Object.entries(extraParams)) {
    if (value === null) {
      delete result[key];
    }
    else if (isPlainObject(value) && isPlainObject(result[key])) {
      result[key] = applyExtraParams(result[key], value);
    }
    else {
      result[key] = value;
    }
  }
  return result as T;
}

const UNSUPPORTED_PARAM_PATTERN = /Unsupported (?:parameter|value): '([^']+)'/;
const MAX_UNSUPPORTED_PARAM_RETRIES = 3;

/** model -> top-level request fields the model rejected (learned at runtime, single instance) */
const unsupportedParamsByModel = new Map<string, Set<string>>();

/**
 * Call the provider, dropping top-level fields the model rejects
 * (e.g. "Unsupported parameter: 'temperature'" on reasoning models) and retrying.
 * Rejected fields are remembered per model so later calls skip the failing request.
 */
export async function callWithUnsupportedParamRetry<TBody extends object, TResult>(
  model: string,
  body: TBody,
  call: (body: TBody) => Promise<TResult>,
  getErrorMessage: (error: unknown) => string | undefined
): Promise<TResult> {
  const known = unsupportedParamsByModel.get(model);
  let current = { ...body } as Record<string, unknown>;
  for (const key of known ?? []) delete current[key];

  for (let attempt = 0; ; attempt++) {
    try {
      return await call(current as TBody);
    }
    catch (error) {
      const param = getErrorMessage(error)?.match(UNSUPPORTED_PARAM_PATTERN)?.[1];
      if (!param || !(param in current) || attempt >= MAX_UNSUPPORTED_PARAM_RETRIES) {
        throw error;
      }
      const rest = { ...current };
      delete rest[param];
      current = rest;
      unsupportedParamsByModel.set(model, (unsupportedParamsByModel.get(model) ?? new Set()).add(param));
    }
  }
}

/**
 * Build a summary of tool calls for error messages
 */
export function buildToolErrorSummary(toolCalls: ExecutedToolCall[]): string {
  return toolCalls
    .map((tc) => {
      const resultStr = JSON.stringify(tc.result);
      const truncated = resultStr.length > TOOL_RESULT_TRUNCATE_LENGTH
        ? resultStr.slice(0, TOOL_RESULT_TRUNCATE_LENGTH) + '...'
        : resultStr;
      return `- ${tc.name}: ${truncated}`;
    })
    .join('\n');
}

/**
 * Attach tool calls executed so far to an error thrown mid tool loop, so they survive a failed node
 */
export function withToolCalls(error: unknown, toolCalls: ExecutedToolCall[]): Error {
  if (toolCalls.length === 0) {
    return error instanceof Error ? error : new Error(String(error));
  }
  if (error instanceof NodeExecutionError) {
    error.context.toolCalls ??= [...toolCalls];
    return error;
  }
  const message = error instanceof Error ? error.message : String(error);
  return new NodeExecutionError(message, { toolCalls: [...toolCalls] }, error);
}
