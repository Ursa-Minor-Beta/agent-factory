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
    agentName: { type: 'string' },
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
    runId: { type: 'string', nullable: true },
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
    files: {
      type: 'array',
      items: { type: 'string' },
      nullable: true,
      description: 'File references in format "inner:<fileId>:<fieldName>"',
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
    container.runManager,
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

  // Update session
  app.patch('/api/sessions/:id', {
    schema: {
      tags: ['sessions'],
      summary: 'Update session',
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
          title: { type: 'string', nullable: true },
          status: { type: 'string', enum: ['active', 'archived'] },
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
    const { title, status } = request.body as { title?: string; status?: 'active' | 'archived' };

    const session = await sessionService.update(userId, id, { title, status });

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

  // Delete sessions by ID(s) or agentId(s)
  app.post('/api/sessions/delete', {
    schema: {
      tags: ['sessions'],
      summary: 'Delete sessions',
      description: 'Delete sessions by ID(s) or agentId(s). Users can only delete their own sessions. Admins can delete any sessions. At least one parameter (id or agentId) must be provided.',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      body: {
        type: 'object',
        properties: {
          id: { description: 'Session ID(s) to delete' },
          agentId: { description: 'Agent ID(s) - delete all sessions for these agents' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                deletedCount: { type: 'integer' },
              },
            },
          },
        },
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
      },
    },
    preHandler: requireAuth,
  }, async (request, reply) => {
    const { userId, role } = request.user as { userId: string; role: string };
    const body = request.body as {
      id?: string | string[];
      agentId?: string | string[];
    };

    if (!body.id && !body.agentId) {
      return reply.code(400).send({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'At least one of id or agentId must be provided',
        },
      });
    }

    const deletedCount = await sessionService.deleteMany(userId, role, {
      id: body.id,
      agentId: body.agentId,
    });

    return reply.send({
      success: true,
      data: {
        deletedCount,
      },
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
