/**
 * Tools for LLM function calling
 */

// Export types
export type {
  ToolDefinition,
  BuiltinToolDefinition,
  AgentToolDefinition,
  ToolParameters,
} from './types.js';

// Export built-in tools
export { SAVE_NOTE_TOOL } from './save-note.js';

import { SAVE_NOTE_TOOL } from './save-note.js';
import type { BuiltinToolDefinition } from './types.js';

/**
 * All available built-in tools
 */
export const BUILTIN_TOOLS: Record<string, BuiltinToolDefinition> = {
  save_note: SAVE_NOTE_TOOL,
};

/**
 * Get a built-in tool by name
 */
export function getBuiltinTool(name: string): BuiltinToolDefinition | undefined {
  return BUILTIN_TOOLS[name];
}
