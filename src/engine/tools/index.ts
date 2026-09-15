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
export { CREATE_AGENT_TOOL } from './create-agent.js';
export { GET_AGENT_TOOL } from './get-agent.js';
export { UPDATE_AGENT_TOOL } from './update-agent.js';

import { CREATE_AGENT_TOOL } from './create-agent.js';
import { GET_AGENT_TOOL } from './get-agent.js';
import { UPDATE_AGENT_TOOL } from './update-agent.js';
import type { BuiltinToolDefinition } from './types.js';

/**
 * All available built-in tools
 */
export const BUILTIN_TOOLS: Record<string, BuiltinToolDefinition> = {
  create_agent: CREATE_AGENT_TOOL,
  get_agent: GET_AGENT_TOOL,
  update_agent: UPDATE_AGENT_TOOL,
};

/**
 * Get a built-in tool by name
 */
export function getBuiltinTool(name: string): BuiltinToolDefinition | undefined {
  return BUILTIN_TOOLS[name];
}
