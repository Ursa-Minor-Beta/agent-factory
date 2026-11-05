/** Wire protocols the LLM node knows how to speak (one adapter per protocol) */
export const LLM_PROTOCOLS = ['openai', 'anthropic', 'ollama'] as const;
export type LlmProtocol = (typeof LLM_PROTOCOLS)[number];

export interface LlmProviderPreset {
  label: string;
  protocol: LlmProtocol;
  /** Default base URL; undefined means the SDK default */
  defaultBaseUrl?: string;
  requiresApiKey: boolean;
  /** No usable default endpoint - config must provide baseUrl */
  requiresBaseUrl?: boolean;
}

/**
 * LLM provider presets. A provider is a protocol + default endpoint, so adding an
 * OpenAI-compatible vendor is just a new entry here (no adapter code).
 */
export const LLM_PROVIDER_PRESETS = {
  'anthropic': { label: 'Anthropic', protocol: 'anthropic', requiresApiKey: true },
  'deepseek': { label: 'DeepSeek', protocol: 'openai', defaultBaseUrl: 'https://api.deepseek.com', requiresApiKey: true },
  'groq': { label: 'Groq', protocol: 'openai', defaultBaseUrl: 'https://api.groq.com/openai/v1', requiresApiKey: true },
  'mistral': { label: 'Mistral', protocol: 'openai', defaultBaseUrl: 'https://api.mistral.ai/v1', requiresApiKey: true },
  'ollama': { label: 'Ollama', protocol: 'ollama', defaultBaseUrl: 'http://localhost:11434', requiresApiKey: false },
  'openai': { label: 'OpenAI', protocol: 'openai', requiresApiKey: true },
  /** Any other OpenAI-compatible endpoint (vLLM, LM Studio, LiteLLM, ...) - baseUrl required */
  'openai-compatible': { label: 'OpenAI-compatible', protocol: 'openai', requiresApiKey: false, requiresBaseUrl: true },
  'openrouter': { label: 'OpenRouter', protocol: 'openai', defaultBaseUrl: 'https://openrouter.ai/api/v1', requiresApiKey: true },
  'together': { label: 'Together AI', protocol: 'openai', defaultBaseUrl: 'https://api.together.xyz/v1', requiresApiKey: true },
  'xai': { label: 'xAI', protocol: 'openai', defaultBaseUrl: 'https://api.x.ai/v1', requiresApiKey: true },
} as const satisfies Record<string, LlmProviderPreset>;

export type LlmProviderType = keyof typeof LLM_PROVIDER_PRESETS;
export const LLM_PROVIDER_TYPES = Object.keys(LLM_PROVIDER_PRESETS) as LlmProviderType[];

export const PROVIDER_TYPES = [...LLM_PROVIDER_TYPES, 'github'] as const;
export type ProviderType = LlmProviderType | 'github';

export function isLlmProviderType(provider: string): provider is LlmProviderType {
  return Object.hasOwn(LLM_PROVIDER_PRESETS, provider);
}

export interface ProviderConfig {
  id: string;
  userId: string;
  provider: ProviderType;
  name: string;              // "Production OpenAI", "Local Ollama"
  isDefault: boolean;        // Default config for this provider type
  config: {
    apiKey?: string;         // For OpenAI, Anthropic
    baseUrl?: string;        // For Ollama, custom endpoints
  };
  /** Workspace scope - null/undefined means global (available to all agents) */
  workspaceId?: string;
  /** Workspace name (populated via lookup) */
  workspaceName?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateProviderConfigDTO {
  userId: string;
  provider: ProviderType;
  name: string;
  isDefault?: boolean;
  config: {
    apiKey?: string;
    baseUrl?: string;
  };
  workspaceId?: string;
}

export interface UpdateProviderConfigDTO {
  name?: string;
  isDefault?: boolean;
  config?: {
    apiKey?: string;
    baseUrl?: string;
  };
  workspaceId?: string | null;
}
