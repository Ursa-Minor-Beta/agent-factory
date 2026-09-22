import { FastifyInstance } from 'fastify';
import { RunService } from '../services/run.service.js';
import { container } from '../config/container.js';
import { requireAuth } from '../middleware/auth.js';
import type { RunStatus } from '../domain/entities/Run.js';

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
    state: {},
    error: { type: 'string', nullable: true },
    errorDetails: { type: 'object', nullable: true },
    startedAt: { type: 'string', format: 'date-time', nullable: true },
    completedAt: { type: 'string', format: 'date-time', nullable: true },
  },
};

const triggeredBySchema = {
  type: 'object',
  properties: {
    triggerType: { type: 'string', enum: ['agent_node', 'tool_call'] },
    nodeId: { type: 'string' },
    toolName: { type: 'string' },
  },
};

// Lightweight schema for list views (no input, output, nodeStates)
const runSummarySchema: Record<string, unknown> = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    agentId: { type: 'string' },
    userId: { type: 'string' },
    status: { type: 'string', enum: ['pending', 'running', 'completed', 'failed', 'cancelling', 'cancelled'] },
    error: { type: 'string', nullable: true },
    startedAt: { type: 'string', format: 'date-time' },
    completedAt: { type: 'string', format: 'date-time', nullable: true },
    parentRunId: { type: 'string' },
    triggeredBy: triggeredBySchema,
    childRunIds: { type: 'array', items: { type: 'string' } },
  },
};

const runSchema: Record<string, unknown> = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    agentId: { type: 'string' },
    userId: { type: 'string' },
    input: { type: 'object', additionalProperties: true },
    output: { type: 'object', additionalProperties: true, nullable: true },
    status: { type: 'string', enum: ['pending', 'running', 'completed', 'failed', 'cancelling', 'cancelled'] },
    nodeStates: { type: 'object', additionalProperties: nodeStateSchema },
    error: { type: 'string', nullable: true },
    startedAt: { type: 'string', format: 'date-time' },
    completedAt: { type: 'string', format: 'date-time', nullable: true },
    parentRunId: { type: 'string' },
    triggeredBy: triggeredBySchema,
    childRuns: { type: 'array' }, // Recursive reference handled by Fastify
  },
};

export async function runRoutes(app: FastifyInstance) {
  const runService = new RunService(
    container.runRepository,
    container.agentRepository,
    container.runManager,
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
            data: { type: 'array', items: runSummarySchema },
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

    // Use summary query for list view (excludes input, output, nodeStates)
    const result = await runService.listAllSummary({
      userId,
      agentId,
      limit,
    });

    return reply.send({
      success: true,
      data: result.runs,
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
      querystring: {
        type: 'object',
        properties: {
          includeChildren: { type: 'boolean', default: false, description: 'Include full child runs data' },
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
    const { includeChildren } = request.query as { includeChildren?: boolean };

    const run = includeChildren
      ? await runService.getByIdWithChildren(userId, id)
      : await runService.getById(userId, id);

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
      description: 'List runs with optional filtering, sorting, and pagination. Users see their own runs. Admins can see all runs and filter by userId.',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      querystring: {
        type: 'object',
        properties: {
          userId: { type: 'string', description: 'Filter by user ID (admin only)' },
          agentId: { type: 'string', description: 'Filter by agent ID' },
          status: { type: 'string', enum: ['pending', 'running', 'completed', 'failed', 'cancelling', 'cancelled'], description: 'Filter by status' },
          startedAfter: { type: 'string', format: 'date-time', description: 'Filter by started date (after)' },
          startedBefore: { type: 'string', format: 'date-time', description: 'Filter by started date (before)' },
          sortBy: { type: 'string', enum: ['startedAt', 'completedAt'], default: 'startedAt' },
          sortOrder: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
          skip: { type: 'integer', minimum: 0, default: 0 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
          includeChildren: { type: 'boolean', default: false, description: 'Return only parent runs with children aggregated' },
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
                runs: { type: 'array', items: runSummarySchema },
                total: { type: 'integer' },
              },
            },
          },
        },
        401: errorSchema,
      },
    },
    preHandler: requireAuth,
  }, async (request, reply) => {
    const { userId: currentUserId, role } = request.user as { userId: string; role: string };
    const query = request.query as {
      userId?: string;
      agentId?: string;
      status?: RunStatus;
      startedAfter?: string;
      startedBefore?: string;
      sortBy?: 'startedAt' | 'completedAt';
      sortOrder?: 'asc' | 'desc';
      skip?: number;
      limit?: number;
      includeChildren?: boolean;
    };

    // Users can only see their own runs
    // Admins can see all or filter by userId
    const effectiveUserId = role === 'admin' ? query.userId : currentUserId;

    // Use summary with child IDs when includeChildren is true
    if (query.includeChildren) {
      const result = await runService.listParentsWithChildIdsSummary({
        userId: effectiveUserId,
        agentId: query.agentId,
        status: query.status,
        startedAfter: query.startedAfter ? new Date(query.startedAfter) : undefined,
        startedBefore: query.startedBefore ? new Date(query.startedBefore) : undefined,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
        skip: query.skip,
        limit: query.limit,
      });

      return reply.send({
        success: true,
        data: result,
      });
    }

    // Use summary query for list view (excludes input, output, nodeStates)
    const result = await runService.listAllSummary({
      userId: effectiveUserId,
      agentId: query.agentId,
      status: query.status,
      startedAfter: query.startedAfter ? new Date(query.startedAfter) : undefined,
      startedBefore: query.startedBefore ? new Date(query.startedBefore) : undefined,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      skip: query.skip,
      limit: query.limit,
    });

    return reply.send({
      success: true,
      data: result,
    });
  });
}
