import type { ToolDefinition } from '../../tools/index.js';

/**
 * LLM node configuration data
 */
export interface LLMNodeData {
  provider: 'openai' | 'anthropic' | 'ollama';
  model: string;
  systemPrompt?: string;
  userPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  maxMessages?: number;
  tools?: ToolDefinition[];
  maxToolCalls?: number;
}

/**
 * Token usage tracking
 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

/**
 * Executed tool call record
 */
export interface ExecutedToolCall {
  name: string;
  result: unknown;
}

/**
 * Result from a provider call
 */
export interface ProviderCallResult {
  response: string;
  usage: TokenUsage;
  toolCalls?: ExecutedToolCall[];
}
