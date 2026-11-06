import type { ExecutedToolCall } from './types.js';
import type { ToolDefinition, ClientToolDefinition } from '../../tools/index.js';
import type { ExecutionOptions } from '../base.js';
import { getBuiltinTool } from '../../tools/index.js';
import { executeBuiltinTool } from './builtin-tools/index.js';
import { executeSubAgent } from './sub-agent.js';
import { TOOL_RESULT_TRUNCATE_LENGTH } from './constants.js';

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
