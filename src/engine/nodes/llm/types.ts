import type { ToolDefinition } from '../../tools/index.js';
import type { ToolExecutionMode } from './constants.js';
import type { LlmProviderType } from '../../../domain/entities/ProviderConfig.js';
import type { ChatMessage, ExecutionOptions, ResolvedProvider } from '../base.js';

/**
 * LLM node configuration data
 */
export interface LLMNodeData {
  /** Provider type key (e.g. "openai", "deepseek") - resolved to a protocol at runtime */
  provider: LLMProvider;
  model: string;
  systemPrompt?: string;
  userPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  maxMessages?: number;
  tools?: ToolDefinition[];
  maxToolCalls?: number;
  /** Tool execution mode: 'parallel' runs all tools simultaneously, 'sequential' runs one at a time */
  toolExecutionMode?: ToolExecutionMode;
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
export type LLMProvider = LlmProviderType;

/**
 * Cumulative usage per provider (stored at Run level)
 */
export type RunUsage = Partial<Record<LLMProvider, TokenUsage>>;

/**
 * Protocol adapter - one implementation per wire protocol
 */
export type ProviderAdapter = (
  data: LLMNodeData,
  provider: ResolvedProvider,
  systemPrompt: string | undefined,
  userPrompt: string,
  conversationHistory: ChatMessage[],
  options: ExecutionOptions,
  nodeId: string
) => Promise<ProviderCallResult>;

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
