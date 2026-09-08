import { FastifyInstance } from 'fastify';
import { ProviderConfigService } from '../services/provider-config.service.js';
import { container } from '../config/container.js';
import { requireAuth } from '../middleware/auth.js';
import type { ProviderType } from '../domain/entities/ProviderConfig.js';

const PROVIDER_TYPES = ['openai', 'anthropic', 'ollama'];

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
    provider: { type: 'string', enum: PROVIDER_TYPES, description: 'Provider type: openai | anthropic | ollama' },
    name: { type: 'string' },
    isDefault: { type: 'boolean' },
    config: {
      type: 'object',
      properties: {
        apiKey: { type: 'string', description: 'Masked API key' },
        baseUrl: { type: 'string' },
      },
    },
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

  // Get all provider configs
  app.get('/api/providers', {
    schema: {
      tags: ['providers'],
      summary: 'Get all provider configurations',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
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
    const configs = await providerConfigService.getAll(userId);

    // Mask API keys in response
    const maskedConfigs = configs.map((c) => ({
      ...c,
      config: {
        ...c.config,
        apiKey: maskApiKey(c.config.apiKey),
      },
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
          provider: { type: 'string', enum: PROVIDER_TYPES, description: 'Provider type: openai | anthropic | ollama' },
          name: { type: 'string', minLength: 1, description: 'Display name (e.g., "Production OpenAI")' },
          isDefault: { type: 'boolean', default: false },
          config: {
            type: 'object',
            properties: {
              apiKey: { type: 'string', description: 'API key (for openai, anthropic)' },
              baseUrl: { type: 'string', description: 'Base URL (for ollama)' },
            },
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
    };

    const config = await providerConfigService.create(userId, {
      provider: body.provider,
      name: body.name,
      isDefault: body.isDefault,
      config: body.config ?? {},
    });

    return reply.status(201).send({
      success: true,
      data: {
        ...config,
        config: {
          ...config.config,
          apiKey: maskApiKey(config.config.apiKey),
        },
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
