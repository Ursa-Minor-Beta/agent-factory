import { FastifyInstance } from 'fastify';
import { ProviderConfigService } from '../services/provider-config.service.js';
import { container } from '../config/container.js';
import { requireAuth } from '../middleware/auth.js';
import {
  PROVIDER_TYPES,
  LLM_PROTOCOLS,
  LLM_PROVIDER_PRESETS,
  LLM_PROVIDER_TYPES,
  type ProviderType,
  type LlmProviderPreset,
} from '../domain/entities/ProviderConfig.js';
import type { ProviderConfigQueryOptions } from '../domain/interfaces/repositories/IProviderConfigRepository.js';

// Schemas
const errorSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    error: {
      type: 'object',
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
      },
    },
  },
};

const providerConfigSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    userId: { type: 'string' },
    provider: { type: 'string', enum: PROVIDER_TYPES, description: 'Provider type (LLM preset key or github); see GET /api/providers/presets' },
    name: { type: 'string' },
    isDefault: { type: 'boolean' },
    config: {
      type: 'object',
      properties: {
        apiKey: { type: 'string', description: 'Masked API key' },
        baseUrl: { type: 'string' },
      },
    },
    workspaceId: { type: 'string', nullable: true },
    workspaceName: { type: 'string', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

// Mask API key for responses
function maskApiKey(key?: string): string | undefined {
  if (!key) return undefined;
  if (key.length <= 8) return '****';
  return key.slice(0, 4) + '****' + key.slice(-4);
}

export async function settingsRoutes(app: FastifyInstance) {
  const providerConfigService = new ProviderConfigService(
    container.providerConfigRepository
  );

  // Get provider presets for the provider form: LLM presets (protocol + default endpoint) and integrations
  app.get('/api/providers/presets', {
    schema: {
      tags: ['providers'],
      summary: 'Get available provider presets (LLM and integrations)',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  provider: { type: 'string' },
                  kind: { type: 'string', enum: ['llm', 'integration'] },
                  label: { type: 'string' },
                  protocol: { type: 'string', enum: LLM_PROTOCOLS, nullable: true, description: 'LLM wire protocol; null for integrations' },
                  defaultBaseUrl: { type: 'string', nullable: true },
                  requiresApiKey: { type: 'boolean' },
                  requiresBaseUrl: { type: 'boolean' },
                },
              },
            },
          },
        },
        401: errorSchema,
      },
    },
    preHandler: requireAuth,
  }, async () => {
    const llmPresets = LLM_PROVIDER_TYPES.map((provider) => {
      const preset: LlmProviderPreset = LLM_PROVIDER_PRESETS[provider];
      return {
        provider,
        kind: 'llm',
        label: preset.label,
        protocol: preset.protocol,
        defaultBaseUrl: preset.defaultBaseUrl ?? null,
        requiresApiKey: preset.requiresApiKey,
        requiresBaseUrl: preset.requiresBaseUrl ?? false,
      };
    });
    // GitHub token (stored in config.apiKey) used for git sync
    const github = {
      provider: 'github',
      kind: 'integration',
      label: 'GitHub',
      protocol: null,
      defaultBaseUrl: null,
      requiresApiKey: true,
      requiresBaseUrl: false,
    };
    return { success: true, data: [...llmPresets, github] };
  });

  // Get all provider configs
  app.get('/api/providers', {
    schema: {
      tags: ['providers'],
      summary: 'Get all provider configurations',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      querystring: {
        type: 'object',
        properties: {
          provider: {
            type: 'string',
            enum: PROVIDER_TYPES,
            description: 'Filter by provider type (e.g., "github", "openai")',
          },
          workspaceId: {
            type: 'string',
            description: 'Filter by workspace ID. Omit for all, "null" for global only, or ID for workspace only.',
          },
          name: { type: 'string', description: 'Filter by name (contains, case-insensitive)' },
          sortBy: { type: 'string', enum: ['name', 'provider', 'createdAt', 'updatedAt'], description: 'Sort field (default: provider, then name)' },
          sortOrder: { type: 'string', enum: ['asc', 'desc'], default: 'asc' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'array', items: providerConfigSchema },
          },
        },
        401: errorSchema,
      },
    },
    preHandler: requireAuth,
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const query = request.query as {
      provider?: ProviderType;
      workspaceId?: string;
      name?: string;
      sortBy?: 'name' | 'provider' | 'createdAt' | 'updatedAt';
      sortOrder?: 'asc' | 'desc';
    };

    const options: ProviderConfigQueryOptions = {
      name: query.name,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    };
    if (query.provider) {
      options.provider = query.provider;
    }
    if (query.workspaceId === 'null') {
      options.workspaceId = null;
    }
    else if (query.workspaceId) {
      options.workspaceId = query.workspaceId;
    }

    const configs = await providerConfigService.getAll(userId, options);

    // Mask API keys in response
    const maskedConfigs = configs.map((c) => ({
      ...c,
      config: {
        ...c.config,
        apiKey: maskApiKey(c.config.apiKey),
      },
      workspaceId: c.workspaceId ?? null,
      workspaceName: c.workspaceName ?? null,
    }));

    return reply.send({
      success: true,
      data: maskedConfigs,
    });
  });

  // Get provider config by ID
  app.get('/api/providers/:id', {
    schema: {
      tags: ['providers'],
      summary: 'Get a specific provider configuration',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: providerConfigSchema,
          },
        },
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
      },
    },
    preHandler: requireAuth,
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };

    const config = await providerConfigService.getById(userId, id);

    return reply.send({
      success: true,
      data: {
        ...config,
        config: {
          ...config.config,
          apiKey: maskApiKey(config.config.apiKey),
        },
        workspaceId: config.workspaceId ?? null,
        workspaceName: config.workspaceName ?? null,
      },
    });
  });

  // Create provider config
  app.post('/api/providers', {
    schema: {
      tags: ['providers'],
      summary: 'Create a new provider configuration',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      body: {
        type: 'object',
        required: ['provider', 'name'],
        properties: {
          provider: { type: 'string', enum: PROVIDER_TYPES, description: 'Provider type (LLM preset key or github); see GET /api/providers/presets' },
          name: { type: 'string', minLength: 1, description: 'Display name (e.g., "Production OpenAI")' },
          isDefault: { type: 'boolean', default: false },
          config: {
            type: 'object',
            properties: {
              apiKey: { type: 'string', description: 'API key (required for most hosted LLM providers)' },
              baseUrl: { type: 'string', description: 'Base URL; overrides the preset default (required for openai-compatible)' },
            },
          },
          workspaceId: {
            type: 'string',
            description: 'Workspace ID to scope the config to. Omit for global scope.',
          },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: providerConfigSchema,
          },
        },
        401: errorSchema,
      },
    },
    preHandler: requireAuth,
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const body = request.body as {
      provider: ProviderType;
      name: string;
      isDefault?: boolean;
      config?: { apiKey?: string; baseUrl?: string };
      workspaceId?: string;
    };

    const config = await providerConfigService.create(userId, {
      provider: body.provider,
      name: body.name,
      isDefault: body.isDefault,
      config: body.config ?? {},
      workspaceId: body.workspaceId,
    });

    return reply.status(201).send({
      success: true,
      data: {
        ...config,
        config: {
          ...config.config,
          apiKey: maskApiKey(config.config.apiKey),
        },
        workspaceId: config.workspaceId ?? null,
        workspaceName: config.workspaceName ?? null,
      },
    });
  });

  // Update provider config
  app.patch('/api/providers/:id', {
    schema: {
      tags: ['providers'],
      summary: 'Update a provider configuration',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
      },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1 },
          config: {
            type: 'object',
            properties: {
              apiKey: { type: 'string' },
              baseUrl: { type: 'string' },
            },
          },
          workspaceId: {
            type: 'string',
            nullable: true,
            description: 'Workspace ID to scope the config to. Set to null for global scope.',
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: providerConfigSchema,
          },
        },
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
      },
    },
    preHandler: requireAuth,
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };
    const body = request.body as {
      name?: string;
      config?: { apiKey?: string; baseUrl?: string };
      workspaceId?: string | null;
    };

    const config = await providerConfigService.update(userId, id, body);

    return reply.send({
      success: true,
      data: {
        ...config,
        config: {
          ...config.config,
          apiKey: maskApiKey(config.config.apiKey),
        },
        workspaceId: config.workspaceId ?? null,
        workspaceName: config.workspaceName ?? null,
      },
    });
  });

  // Set provider config as default
  app.post('/api/providers/:id/default', {
    schema: {
      tags: ['providers'],
      summary: 'Set a provider configuration as default for its type',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: providerConfigSchema,
          },
        },
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
      },
    },
    preHandler: requireAuth,
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };

    const config = await providerConfigService.setDefault(userId, id);

    return reply.send({
      success: true,
      data: {
        ...config,
        config: {
          ...config.config,
          apiKey: maskApiKey(config.config.apiKey),
        },
        workspaceId: config.workspaceId ?? null,
        workspaceName: config.workspaceName ?? null,
      },
    });
  });

  // Delete provider config
  app.delete('/api/providers/:id', {
    schema: {
      tags: ['providers'],
      summary: 'Delete a provider configuration',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
          },
        },
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
      },
    },
    preHandler: requireAuth,
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };

    await providerConfigService.delete(userId, id);

    return reply.send({
      success: true,
      message: 'Provider configuration deleted',
    });
  });
}
