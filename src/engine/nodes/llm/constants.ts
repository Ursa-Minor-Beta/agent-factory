/** Default max conversation history messages for multi-turn conversations */
export const DEFAULT_MAX_MESSAGES = 0;

/** Default max tool call iterations before giving up */
export const DEFAULT_MAX_TOOL_CALLS = 5;

/** Default temperature for LLM responses */
export const DEFAULT_TEMPERATURE = 0.7;

/** Default max tokens for LLM responses */
export const DEFAULT_MAX_TOKENS = 1000;

/** Default models per provider */
export const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';
export const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-20250514';
export const DEFAULT_OLLAMA_MODEL = 'llama3.2';

/** Max length for tool result strings in error summaries */
export const TOOL_RESULT_TRUNCATE_LENGTH = 200;
