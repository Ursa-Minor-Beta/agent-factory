import { FastifyInstance } from 'fastify';
import { AgentService } from '../services/agent.service.js';
import { SessionService } from '../services/session.service.js';
import { container } from '../config/container.js';
import { requireAuth } from '../middleware/auth.js';
import { NODE_TYPES, AGENT_STATUSES } from '../domain/entities/Agent.js';
import { validateWorkflow } from '../engine/graph.js';

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
    position: {
      type: 'object',
      properties: {
        x: { type: 'number' },
        y: { type: 'number' },
      },
    },
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
    status: { type: 'string', enum: AGENT_STATUSES as unknown as string[] },
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
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'array', items: agentSchema },
          },
        },
        401: errorSchema,
      },
    },
    preHandler: requireAuth,
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const agents = await agentService.list(userId);

    return reply.send({
      success: true,
      data: agents,
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
          status: { type: 'string', enum: AGENT_STATUSES as unknown as string[] },
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
      status?: 'draft' | 'published';
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
      description: 'Send a message to an agent and get a response. Auto-creates a session if not provided.',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
      },
      body: {
        type: 'object',
        required: ['message'],
        properties: {
          message: { type: 'string', description: 'The message to send to the agent' },
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
    const { message, sessionId, incognito } = request.body as {
      message: string;
      sessionId?: string;
      incognito?: boolean;
    };

    const result = await sessionService.chat(userId, agentId, message, {
      sessionId,
      incognito,
    });

    return reply.send({
      success: true,
      data: result,
    });
  });
}
