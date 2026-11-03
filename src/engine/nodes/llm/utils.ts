import type { ExecutedToolCall } from './types.js';
import type { ToolDefinition, ClientToolDefinition } from '../../tools/index.js';
import type { ExecutionOptions } from '../base.js';
import { getBuiltinTool } from '../../tools/index.js';
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
