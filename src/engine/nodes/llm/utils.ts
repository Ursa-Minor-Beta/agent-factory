import type { ExecutedToolCall } from './types.js';
import type { ToolDefinition } from '../../tools/index.js';
import { getBuiltinTool } from '../../tools/index.js';
import { TOOL_RESULT_TRUNCATE_LENGTH } from './constants.js';

/**
 * Resolve tool definitions by looking up builtin tools from the registry.
 * Builtin tools specified without parameters will get their full definition.
 */
export function resolveTools(tools: ToolDefinition[] | undefined): ToolDefinition[] | undefined {
  if (!tools) return undefined;

  return tools.map((tool) => {
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
