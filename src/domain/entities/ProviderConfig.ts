export type ProviderType = 'openai' | 'anthropic' | 'ollama';

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
}

export interface UpdateProviderConfigDTO {
  name?: string;
  isDefault?: boolean;
  config?: {
    apiKey?: string;
    baseUrl?: string;
  };
}
