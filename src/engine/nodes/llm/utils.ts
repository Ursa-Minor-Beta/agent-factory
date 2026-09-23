import type { ExecutedToolCall } from './types.js';
import { TOOL_RESULT_TRUNCATE_LENGTH } from './constants.js';

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
