/**
 * Tool type definitions for LLM function calling
 */

export interface ToolParameters {
  type: 'object';
  properties: Record<string, { type: string; description?: string }>;
  required?: string[];
  [key: string]: unknown; // Index signature for OpenAI compatibility
}

/**
 * Base tool definition for LLM function calling
 */
export interface ToolDefinition {
  type: 'agent' | 'builtin';
  agentId?: string; // Required for agent tools
  name: string;
  description: string;
  parameters: ToolParameters;
}

/**
 * Built-in tool definition (type is always 'builtin')
 */
export interface BuiltinToolDefinition extends Omit<ToolDefinition, 'type' | 'agentId'> {
  type: 'builtin';
}

/**
 * Agent tool definition (type is always 'agent', agentId is required)
 */
export interface AgentToolDefinition extends Omit<ToolDefinition, 'type' | 'agentId'> {
  type: 'agent';
  agentId: string;
}
