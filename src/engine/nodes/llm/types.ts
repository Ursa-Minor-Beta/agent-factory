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
 * Token usage tracking (per LLM call)
 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  // OpenAI specific
  cachedTokens?: number;
  reasoningTokens?: number;
  // Anthropic specific
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
}

/**
 * Provider type for usage tracking
 */
export type LLMProvider = 'openai' | 'anthropic' | 'ollama';

/**
 * Cumulative usage per provider (stored at Run level)
 */
export type RunUsage = {
  [K in LLMProvider]?: TokenUsage;
};

/**
 * Executed tool call record
 */
export interface ExecutedToolCall {
  name: string;
  input: Record<string, unknown>;
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
