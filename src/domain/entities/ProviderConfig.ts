export const PROVIDER_TYPES = ['openai', 'anthropic', 'ollama'] as const;
export type ProviderType = (typeof PROVIDER_TYPES)[number];

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
