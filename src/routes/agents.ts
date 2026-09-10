import { FastifyInstance } from 'fastify';
import { AgentService } from '../services/agent.service.js';
import { SessionService } from '../services/session.service.js';
import { container } from '../config/container.js';
import { requireAuth } from '../middleware/auth.js';
import { NODE_TYPES, type AgentQueryOptions } from '../domain/entities/Agent.js';
import type { AuthenticatedUser } from '../middleware/auth.js';
import { validateWorkflow } from '../engine/graph.js';
import { NotFoundError } from '../utils/errors.js';
import { AGENT_CREATOR } from '../engine/agents/index.js';

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

const nodeSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    type: { type: 'string', enum: NODE_TYPES as unknown as string[] },
    data: { type: 'object', additionalProperties: true },
  },
};

const edgeSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    source: { type: 'string' },
    sourceHandle: { type: 'string' },
    target: { type: 'string' },
    targetHandle: { type: 'string' },
  },
};

const variableSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    type: { type: 'string', enum: ['string', 'number', 'boolean'] },
    defaultValue: {},
  },
};

const agentSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    userId: { type: 'string' },
    name: { type: 'string' },
    description: { type: 'string' },
    nodes: { type: 'array', items: nodeSchema },
    edges: { type: 'array', items: edgeSchema },
    variables: { type: 'array', items: variableSchema },
    isSystem: { type: 'boolean' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

export async function agentRoutes(app: FastifyInstance) {
  const agentService = new AgentService(
    container.agentRepository,
    container.sessionRepository,
    container.messageRepository
  );
  const sessionService = new SessionService(
    container.sessionRepository,
    container.messageRepository,
    container.agentRepository,
    container.runRepository,
    container.providerConfigRepository
  );

  // List agents
  app.get('/api/agents', {
    schema: {
      tags: ['agents'],
      summary: 'List all agents',
      description: 'List agents with optional filtering, sorting, and pagination. Admin can filter by isSystem.',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      querystring: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Filter by exact agent ID' },
          name: { type: 'string', description: 'Filter by name (contains, case-insensitive)' },
          description: { type: 'string', description: 'Filter by description (contains, case-insensitive)' },
          isSystem: { type: 'boolean', description: 'Filter by system agent (admin only)' },
          createdAfter: { type: 'string', format: 'date-time', description: 'Filter by created date (after)' },
          createdBefore: { type: 'string', format: 'date-time', description: 'Filter by created date (before)' },
          sortBy: { type: 'string', enum: ['name', 'createdAt', 'updatedAt'], default: 'updatedAt' },
          sortOrder: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
          skip: { type: 'integer', minimum: 0, default: 0 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
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
                agents: { type: 'array', items: agentSchema },
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
    const { userId, role } = request.user as AuthenticatedUser;
    const query = request.query as {
      id?: string;
      name?: string;
      description?: string;
      isSystem?: boolean;
      createdAfter?: string;
      createdBefore?: string;
      sortBy?: 'name' | 'createdAt' | 'updatedAt';
      sortOrder?: 'asc' | 'desc';
      skip?: number;
      limit?: number;
    };

    // Build options
    // Non-admin users never see system agents (always filter isSystem: false)
    // Admin users can optionally filter by isSystem or see all
    const options: AgentQueryOptions = {
      id: query.id,
      name: query.name,
      description: query.description,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      skip: query.skip,
      limit: query.limit,
      isSystem: role === 'admin' ? query.isSystem : false,
      createdAfter: query.createdAfter ? new Date(query.createdAfter) : undefined,
      createdBefore: query.createdBefore ? new Date(query.createdBefore) : undefined,
    };

    const result = await agentService.list(userId, options);

    return reply.send({
      success: true,
      data: result,
    });
  });

  // Create agent
  app.post('/api/agents', {
    schema: {
      tags: ['agents'],
      summary: 'Create a new agent',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1 },
          description: { type: 'string' },
          nodes: { type: 'array', items: nodeSchema },
          edges: { type: 'array', items: edgeSchema },
          variables: { type: 'array', items: variableSchema },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: agentSchema,
          },
        },
        400: errorSchema,
        401: errorSchema,
      },
    },
    preHandler: requireAuth,
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const body = request.body as {
      name: string;
      description?: string;
      nodes?: any[];
      edges?: any[];
      variables?: any[];
    };

    const agent = await agentService.create(userId, body);

    return reply.status(201).send({
      success: true,
      data: agent,
    });
  });

  // Get agent by ID
  app.get('/api/agents/:id', {
    schema: {
      tags: ['agents'],
      summary: 'Get agent by ID',
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
            data: agentSchema,
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

    const agent = await agentService.getById(userId, id);

    return reply.send({
      success: true,
      data: agent,
    });
  });

  // Update agent
  app.put('/api/agents/:id', {
    schema: {
      tags: ['agents'],
      summary: 'Update agent',
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
          description: { type: 'string' },
          nodes: { type: 'array', items: nodeSchema },
          edges: { type: 'array', items: edgeSchema },
          variables: { type: 'array', items: variableSchema },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: agentSchema,
          },
        },
        400: errorSchema,
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
      description?: string;
      nodes?: any[];
      edges?: any[];
      variables?: any[];
    };

    const agent = await agentService.update(userId, id, body);

    return reply.send({
      success: true,
      data: agent,
    });
  });

  // Validate agent workflow
  app.post('/api/agents/:id/validate', {
    schema: {
      tags: ['agents'],
      summary: 'Validate agent workflow',
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
            data: {
              type: 'object',
              properties: {
                valid: { type: 'boolean' },
                errors: { type: 'array', items: { type: 'string' } },
              },
            },
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

    const agent = await agentService.getById(userId, id);
    const validation = validateWorkflow(agent.nodes, agent.edges);

    return reply.send({
      success: true,
      data: validation,
    });
  });

  // Delete agent and all its sessions/messages
  app.delete('/api/agents/:id', {
    schema: {
      tags: ['agents'],
      summary: 'Delete agent',
      description: 'Deletes the agent and all associated conversation sessions and messages.',
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

    await agentService.delete(userId, id);

    return reply.send({
      success: true,
      message: 'Agent deleted',
    });
  });

  // Chat with agent (conversational mode)
  app.post('/api/agents/:id/chat', {
    schema: {
      tags: ['agents'],
      summary: 'Chat with agent',
      description: 'Send input to an agent and get a response. Input object must match agent schema. Auto-creates a session if not provided.',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
      },
      body: {
        type: 'object',
        required: ['input'],
        properties: {
          input: { type: 'object', additionalProperties: true, description: 'Input object matching agent schema (e.g., { "message": "hello" } or { "text": "hello", "count": 3 })' },
          sessionId: { type: 'string', description: 'Continue an existing session (or incognito_* for incognito sessions)' },
          incognito: { type: 'boolean', default: false, description: 'Start incognito session (messages stored in memory, not persisted)' },
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
                sessionId: { type: 'string', nullable: true },
                response: { type: 'string' },
                runId: { type: 'string' },
                isNewSession: { type: 'boolean' },
              },
            },
          },
        },
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
      },
    },
    preHandler: requireAuth,
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id: agentId } = request.params as { id: string };
    const { input, sessionId, incognito } = request.body as {
      input: Record<string, unknown>;
      sessionId?: string;
      incognito?: boolean;
    };

    const result = await sessionService.chat(userId, agentId, input, {
      sessionId,
      incognito,
    });

    return reply.send({
      success: true,
      data: result,
    });
  });

  // Chat with Agent Creator (convenience route)
  app.post('/api/agents/agent-creator/chat', {
    schema: {
      tags: ['agents'],
      summary: 'Chat with Agent Creator',
      description: 'Conversational interface to create custom agents. Describe what you want and the Agent Creator will build it.',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      body: {
        type: 'object',
        required: ['input'],
        properties: {
          input: { type: 'object', additionalProperties: true, description: 'Input matching agent schema (e.g., { "message": "Create a weather agent" })' },
          sessionId: { type: 'string', description: 'Continue an existing conversation' },
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
                sessionId: { type: 'string', nullable: true },
                response: { type: 'string' },
                runId: { type: 'string' },
                isNewSession: { type: 'boolean' },
              },
            },
          },
        },
        400: errorSchema,
        401: errorSchema,
        404: errorSchema,
      },
    },
    preHandler: requireAuth,
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { input, sessionId } = request.body as {
      input: Record<string, unknown>;
      sessionId?: string;
    };

    const agent = await container.agentRepository.findSystemAgentByName(AGENT_CREATOR.name);
    if (!agent) {
      throw new NotFoundError('Agent Creator not found. Restart server to seed it.');
    }

    const result = await sessionService.chat(userId, agent.id, input, { sessionId });

    return reply.send({
      success: true,
      data: result,
    });
  });
}
