import { FastifyInstance } from 'fastify';
import { AgentService } from '../services/agent.service.js';
import { SessionService } from '../services/session.service.js';
import { RunService } from '../services/run.service.js';
import { SeedService } from '../services/seed.service.js';
import { container } from '../config/container.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { NODE_TYPES, type AgentQueryOptions } from '../domain/entities/Agent.js';
import type { AuthenticatedUser } from '../middleware/auth.js';
import { validateWorkflow } from '../engine/graph.js';
import { NotFoundError, AgentExecutionError } from '../utils/errors.js';
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

const executionErrorSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    error: {
      type: 'object',
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
        runId: { type: 'string' },
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

const agentSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    userId: { type: 'string' },
    name: { type: 'string' },
    description: { type: 'string' },
    nodes: { type: 'array', items: nodeSchema },
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
    container.runManager,
    container.providerConfigRepository,
    container.userSecretRepository
  );
  const runService = new RunService(
    container.runRepository,
    container.agentRepository,
    container.runManager,
    container.providerConfigRepository,
    container.userSecretRepository
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
    const validation = validateWorkflow(agent.nodes);

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
                files: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      mimeType: { type: 'string' },
                      data: { type: 'string' },
                      field: { type: 'string' },
                    },
                  },
                  description: 'Extracted files from response',
                },
                runId: { type: 'string' },
                isNewSession: { type: 'boolean' },
                cancelled: { type: 'boolean', description: 'True if the request was cancelled' },
              },
            },
          },
        },
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        500: executionErrorSchema,
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

    try {
      const result = await sessionService.chat(userId, agentId, input, {
        sessionId,
        incognito,
      });

      return reply.send({
        success: true,
        data: result,
      });
    } catch (error) {
      if (error instanceof AgentExecutionError) {
        return reply.status(500).send({
          success: false,
          error: {
            code: error.code,
            message: error.message,
            runId: error.runId,
          },
        });
      }
      throw error;
    }
  });

  // Chat with agent (SSE streaming mode)
  app.post('/api/agents/:id/chat/stream', {
    schema: {
      tags: ['agents'],
      summary: 'Chat with agent (streaming)',
      description: 'Send input to an agent and get streaming updates via SSE. Returns runId immediately so you can cancel.',
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
          input: { type: 'object', additionalProperties: true },
          sessionId: { type: 'string' },
          incognito: { type: 'boolean', default: false },
        },
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

    // Set SSE headers with CORS
    const origin = request.headers.origin || '*';
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
    });

    const sendEvent = (event: string, data: unknown) => {
      if (reply.raw.writable) {
        reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      }
    };

    // Track all listeners for cleanup
    type NodeEventHandler = (e: { runId: string; nodeId: string; nodeType: string }) => void;
    type RunEventHandler = (e: { runId: string; error?: string }) => void;
    const listeners: Array<{ event: string; handler: NodeEventHandler | RunEventHandler }> = [];
    let cleanedUp = false;

    const cleanupAll = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      for (const { event, handler } of listeners) {
        container.runManager.removeListener(event, handler);
      }
    };

    // Set up close handler early to ensure cleanup on disconnect
    request.raw.on('close', cleanupAll);

    try {
      // Start chat (returns immediately with runId)
      const ctx = await sessionService.chatStream(userId, agentId, input, {
        sessionId,
        incognito,
      });

      // Send init event with runId
      sendEvent('init', ctx.init);

      const runId = ctx.init.runId;

      // Map node type to human-readable status text
      const getStatusText = (nodeType: string, status: string): string => {
        if (status !== 'started') return '';
        switch (nodeType) {
          case 'llm': return 'Thinking...';
          case 'http': return 'Fetching...';
          case 'js': return 'Executing code...';
          case 'agent': return 'Running agent...';
          case 'if-else': return 'Evaluating condition...';
          case 'input': return 'Processing input...';
          case 'output': return 'Preparing output...';
          default: return 'Processing...';
        }
      };

      // Set up event listeners for this run
      const onNodeStarted: NodeEventHandler = (e) => {
        if (e.runId === runId) sendEvent('status', { nodeId: e.nodeId, status: 'started', statusText: getStatusText(e.nodeType, 'started') });
      };
      const onNodeCompleted: NodeEventHandler = (e) => {
        if (e.runId === runId) sendEvent('status', { nodeId: e.nodeId, status: 'completed', statusText: '' });
      };
      const onNodeFailed: NodeEventHandler = (e) => {
        if (e.runId === runId) sendEvent('status', { nodeId: e.nodeId, status: 'failed', statusText: '' });
      };
      const onNodeSkipped: NodeEventHandler = (e) => {
        if (e.runId === runId) sendEvent('status', { nodeId: e.nodeId, status: 'skipped', statusText: '' });
      };

      // Wait for run to complete
      const onComplete: RunEventHandler = (e) => {
        if (e.runId !== runId) return;
        cleanupAll();

        ctx.finalize().then((result) => {
          sendEvent('done', result);
          reply.raw.end();
        }).catch((err) => {
          sendEvent('error', {
            code: err.code ?? 'AGENT_EXECUTION_ERROR',
            message: err.message,
            runId,
          });
          reply.raw.end();
        });
      };

      const onFail: RunEventHandler = (e) => {
        if (e.runId !== runId) return;
        cleanupAll();

        sendEvent('error', {
          code: 'AGENT_EXECUTION_ERROR',
          message: e.error,
          runId,
        });
        reply.raw.end();
      };

      const onCancel: RunEventHandler = (e) => {
        if (e.runId !== runId) return;
        cleanupAll();

        ctx.finalize().then((result) => {
          sendEvent('done', result);
          reply.raw.end();
        }).catch(() => {
          sendEvent('done', {
            sessionId: ctx.init.sessionId,
            response: '',
            files: [],
            runId,
            isNewSession: ctx.init.isNewSession,
            cancelled: true,
          });
          reply.raw.end();
        });
      };

      // Register all listeners and track them for cleanup
      container.runManager.on('node-started', onNodeStarted);
      container.runManager.on('node-completed', onNodeCompleted);
      container.runManager.on('node-failed', onNodeFailed);
      container.runManager.on('node-skipped', onNodeSkipped);
      container.runManager.on('run-completed', onComplete);
      container.runManager.on('run-failed', onFail);
      container.runManager.on('run-cancelled', onCancel);

      listeners.push(
        { event: 'node-started', handler: onNodeStarted },
        { event: 'node-completed', handler: onNodeCompleted },
        { event: 'node-failed', handler: onNodeFailed },
        { event: 'node-skipped', handler: onNodeSkipped },
        { event: 'run-completed', handler: onComplete },
        { event: 'run-failed', handler: onFail },
        { event: 'run-cancelled', handler: onCancel }
      );

    } catch (error) {
      cleanupAll();
      const err = error as Error & { code?: string; runId?: string };
      sendEvent('error', {
        code: err.code ?? 'INTERNAL_ERROR',
        message: err.message,
        runId: err.runId,
      });
      reply.raw.end();
    }
  });

  // Cancel a chat/run
  app.post('/api/agents/:id/cancel', {
    schema: {
      tags: ['agents'],
      summary: 'Cancel a running chat/execution',
      description: 'Cancel a pending or running execution. Returns the updated run status.',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Agent ID' },
        },
      },
      body: {
        type: 'object',
        required: ['runId'],
        properties: {
          runId: { type: 'string', description: 'The run ID to cancel' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            cancelled: { type: 'boolean' },
            message: { type: 'string' },
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
    const { runId } = request.body as { runId: string };

    try {
      const cancelledRun = await runService.cancel(userId, runId);

      const cancelled = cancelledRun.status === 'cancelled';
      const message = cancelled
        ? 'Run cancelled'
        : 'Cancellation requested. Run will stop after current node completes.';

      return reply.send({
        success: true,
        cancelled,
        message,
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('Cannot cancel')) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'CANNOT_CANCEL',
            message: error.message,
          },
        });
      }
      throw error;
    }
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
                files: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      mimeType: { type: 'string' },
                      data: { type: 'string' },
                      field: { type: 'string' },
                    },
                  },
                  description: 'Extracted files from response',
                },
                runId: { type: 'string' },
                isNewSession: { type: 'boolean' },
                cancelled: { type: 'boolean', description: 'True if the request was cancelled' },
              },
            },
          },
        },
        400: errorSchema,
        401: errorSchema,
        404: errorSchema,
        500: executionErrorSchema,
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

    try {
      const result = await sessionService.chat(userId, agent.id, input, { sessionId });

      return reply.send({
        success: true,
        data: result,
      });
    } catch (error) {
      if (error instanceof AgentExecutionError) {
        return reply.status(500).send({
          success: false,
          error: {
            code: error.code,
            message: error.message,
            runId: error.runId,
          },
        });
      }
      throw error;
    }
  });

  // Reseed/update system agents (admin only)
  app.post('/api/agents/system/reseed', {
    schema: {
      tags: ['agents'],
      summary: 'Reseed system agents',
      description: 'Update all built-in system agents with the latest definitions from code. Admin only.',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                updated: { type: 'array', items: { type: 'string' } },
                created: { type: 'array', items: { type: 'string' } },
              },
            },
          },
        },
        401: errorSchema,
        403: errorSchema,
      },
    },
    preHandler: requireAdmin,
  }, async (request, reply) => {
    const seedService = new SeedService(container.userRepository, container.agentRepository);
    const result = await seedService.updateSystemAgents();

    return reply.send({
      success: true,
      data: result,
    });
  });
}
