import { FastifyInstance } from 'fastify';
import { UserSecretService } from '../services/user-secret.service.js';
import { container } from '../config/container.js';
import { requireAuth } from '../middleware/auth.js';

// Mask secret value for responses (only show first 4 chars)
function maskValue(value: string): string {
  if (value.length <= 4) return '****';
  return value.slice(0, 4) + '****';
}

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

const secretSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    maskedValue: { type: 'string' },
    description: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

export async function secretRoutes(app: FastifyInstance) {
  const userSecretService = new UserSecretService(container.userSecretRepository);

  // Get all secrets
  app.get('/api/secrets', {
    schema: {
      tags: ['secrets'],
      summary: 'List all user secrets',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'array', items: secretSchema },
          },
        },
        401: errorSchema,
      },
    },
    preHandler: requireAuth,
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const secrets = await userSecretService.getAll(userId);

    const maskedSecrets = secrets.map((s) => ({
      id: s.id,
      name: s.name,
      maskedValue: maskValue(s.value),
      description: s.description,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));

    return reply.send({ success: true, data: maskedSecrets });
  });

  // Get secret by ID
  app.get('/api/secrets/:id', {
    schema: {
      tags: ['secrets'],
      summary: 'Get a specific secret',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      params: {
        type: 'object',
        properties: { id: { type: 'string' } },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: secretSchema,
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

    const secret = await userSecretService.getById(userId, id);

    return reply.send({
      success: true,
      data: {
        id: secret.id,
        name: secret.name,
        maskedValue: maskValue(secret.value),
        description: secret.description,
        createdAt: secret.createdAt,
        updatedAt: secret.updatedAt,
      },
    });
  });

  // Create secret
  app.post('/api/secrets', {
    schema: {
      tags: ['secrets'],
      summary: 'Create a new secret',
      description: 'Create an encrypted secret that can be referenced in HTTP nodes using {{secret:NAME}} syntax',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      body: {
        type: 'object',
        required: ['name', 'value'],
        properties: {
          name: {
            type: 'string',
            pattern: '^[a-zA-Z_][a-zA-Z0-9_]*$',
            description: 'Secret name (alphanumeric + underscore, must start with letter/underscore)',
          },
          value: {
            type: 'string',
            minLength: 1,
            description: 'Secret value (will be encrypted)',
          },
          description: {
            type: 'string',
            description: 'Optional description',
          },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: secretSchema,
          },
        },
        400: errorSchema,
        401: errorSchema,
        409: errorSchema,
      },
    },
    preHandler: requireAuth,
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const body = request.body as { name: string; value: string; description?: string };

    const secret = await userSecretService.create(userId, body);

    return reply.status(201).send({
      success: true,
      data: {
        id: secret.id,
        name: secret.name,
        maskedValue: maskValue(secret.value),
        description: secret.description,
        createdAt: secret.createdAt,
        updatedAt: secret.updatedAt,
      },
    });
  });

  // Update secret
  app.patch('/api/secrets/:id', {
    schema: {
      tags: ['secrets'],
      summary: 'Update a secret',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      params: {
        type: 'object',
        properties: { id: { type: 'string' } },
      },
      body: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            pattern: '^[a-zA-Z_][a-zA-Z0-9_]*$',
          },
          value: {
            type: 'string',
            minLength: 1,
          },
          description: {
            type: 'string',
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: secretSchema,
          },
        },
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        409: errorSchema,
      },
    },
    preHandler: requireAuth,
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };
    const body = request.body as { name?: string; value?: string; description?: string };

    const secret = await userSecretService.update(userId, id, body);

    return reply.send({
      success: true,
      data: {
        id: secret.id,
        name: secret.name,
        maskedValue: maskValue(secret.value),
        description: secret.description,
        createdAt: secret.createdAt,
        updatedAt: secret.updatedAt,
      },
    });
  });

  // Delete secret
  app.delete('/api/secrets/:id', {
    schema: {
      tags: ['secrets'],
      summary: 'Delete a secret',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      params: {
        type: 'object',
        properties: { id: { type: 'string' } },
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

    await userSecretService.delete(userId, id);

    return reply.send({ success: true, message: 'Secret deleted' });
  });
}
