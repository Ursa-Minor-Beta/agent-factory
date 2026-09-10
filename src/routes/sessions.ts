import { FastifyInstance } from 'fastify';
import { SessionService } from '../services/session.service.js';
import { container } from '../config/container.js';
import { requireAuth } from '../middleware/auth.js';

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

const sessionSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    userId: { type: 'string' },
    agentId: { type: 'string' },
    title: { type: 'string', nullable: true },
    status: { type: 'string', enum: ['active', 'archived'] },
    incognito: { type: 'boolean' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const messageSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    sessionId: { type: 'string' },
    role: { type: 'string', enum: ['user', 'assistant', 'system', 'tool'] },
    content: { type: 'string' },
    toolCalls: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          arguments: {},
          result: {},
        },
      },
      nullable: true,
    },
    createdAt: { type: 'string', format: 'date-time' },
  },
};

export async function sessionRoutes(app: FastifyInstance) {
  const sessionService = new SessionService(
    container.sessionRepository,
    container.messageRepository,
    container.agentRepository,
    container.runRepository,
    container.providerConfigRepository,
    container.userSecretRepository
  );

  // List sessions
  app.get('/api/sessions', {
    schema: {
      tags: ['sessions'],
      summary: 'List conversation sessions',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      querystring: {
        type: 'object',
        properties: {
          agentId: { type: 'string', description: 'Filter by agent ID' },
          status: { type: 'string', enum: ['active', 'archived'] },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
          offset: { type: 'integer', minimum: 0, default: 0 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'array', items: sessionSchema },
          },
        },
        401: errorSchema,
      },
    },
    preHandler: requireAuth,
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { agentId, status, limit, offset } = request.query as {
      agentId?: string;
      status?: 'active' | 'archived';
      limit?: number;
      offset?: number;
    };

    const sessions = await sessionService.list(userId, { agentId, status, limit, offset });

    return reply.send({
      success: true,
      data: sessions,
    });
  });

  // Get session by ID
  app.get('/api/sessions/:id', {
    schema: {
      tags: ['sessions'],
      summary: 'Get session by ID',
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
            data: sessionSchema,
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

    const session = await sessionService.getById(userId, id);

    return reply.send({
      success: true,
      data: session,
    });
  });

  // Delete session and all its messages
  app.delete('/api/sessions/:id', {
    schema: {
      tags: ['sessions'],
      summary: 'Delete session and all its messages',
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

    await sessionService.delete(userId, id);

    return reply.send({
      success: true,
    });
  });

  // Get messages for session
  app.get('/api/sessions/:id/messages', {
    schema: {
      tags: ['sessions'],
      summary: 'Get conversation messages',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
      },
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 500, default: 100 },
          offset: { type: 'integer', minimum: 0, default: 0 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'array', items: messageSchema },
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
    const { limit, offset } = request.query as { limit?: number; offset?: number };

    const messages = await sessionService.getMessages(userId, id, { limit, offset });

    return reply.send({
      success: true,
      data: messages,
    });
  });
}
