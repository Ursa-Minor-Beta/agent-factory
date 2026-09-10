import { FastifyInstance } from 'fastify';
import { RunService } from '../services/run.service.js';
import { container } from '../config/container.js';
import { requireAuth } from '../middleware/auth.js';

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

const nodeStateSchema = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['pending', 'running', 'completed', 'failed', 'skipped'] },
    input: {},
    output: {},
    error: { type: 'string', nullable: true },
    startedAt: { type: 'string', format: 'date-time', nullable: true },
    completedAt: { type: 'string', format: 'date-time', nullable: true },
  },
};

const runSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    agentId: { type: 'string' },
    userId: { type: 'string' },
    input: { type: 'object', additionalProperties: true },
    output: { type: 'object', additionalProperties: true, nullable: true },
    status: { type: 'string', enum: ['pending', 'running', 'completed', 'failed'] },
    nodeStates: { type: 'object', additionalProperties: nodeStateSchema },
    error: { type: 'string', nullable: true },
    startedAt: { type: 'string', format: 'date-time' },
    completedAt: { type: 'string', format: 'date-time', nullable: true },
  },
};

export async function runRoutes(app: FastifyInstance) {
  const runService = new RunService(
    container.runRepository,
    container.agentRepository,
    container.providerConfigRepository,
    container.userSecretRepository
  );

  // List runs for agent
  app.get('/api/agents/:agentId/runs', {
    schema: {
      tags: ['runs'],
      summary: 'List runs for an agent',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      params: {
        type: 'object',
        properties: {
          agentId: { type: 'string' },
        },
      },
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'array', items: runSchema },
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
    const { agentId } = request.params as { agentId: string };
    const { limit } = request.query as { limit?: number };

    const runs = await runService.listByAgent(userId, agentId, limit);

    return reply.send({
      success: true,
      data: runs,
    });
  });

  // Get run by ID
  app.get('/api/runs/:id', {
    schema: {
      tags: ['runs'],
      summary: 'Get run by ID',
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
            data: runSchema,
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

    const run = await runService.getById(userId, id);

    return reply.send({
      success: true,
      data: run,
    });
  });

  // List executions - users see their own, admins see all with optional filter
  app.get('/api/executions', {
    schema: {
      tags: ['runs'],
      summary: 'List executions',
      description: 'Users see their own runs. Admins can see all runs and filter by userId.',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      querystring: {
        type: 'object',
        properties: {
          userId: { type: 'string', description: 'Filter by user ID (admin only)' },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'array', items: runSchema },
          },
        },
        401: errorSchema,
      },
    },
    preHandler: requireAuth,
  }, async (request, reply) => {
    const { userId: currentUserId, role } = request.user as { userId: string; role: string };
    const { userId: filterUserId, limit } = request.query as { userId?: string; limit?: number };

    // Users can only see their own runs
    // Admins can see all or filter by userId
    const effectiveUserId = role === 'admin' ? filterUserId : currentUserId;

    const runs = await runService.listAll({ userId: effectiveUserId, limit });

    return reply.send({
      success: true,
      data: runs,
    });
  });
}
