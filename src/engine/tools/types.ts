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
  type: 'agent' | 'builtin' | 'client';
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

/**
 * Client tool definition - defined and executed by the caller (e.g. the UI editor).
 * Sent per request, never stored on the agent. The run waits for the client to post the result.
 */
export interface ClientToolDefinition extends Omit<ToolDefinition, 'type' | 'agentId'> {
  type: 'client';
  /** LLM node ids that get this tool. Omitted = every LLM node of the agent */
  nodeIds?: string[];
}
