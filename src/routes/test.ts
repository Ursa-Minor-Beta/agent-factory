import { FastifyInstance } from 'fastify';
import { RunService } from '../services/run.service.js';
import { container } from '../config/container.js';
import { requireAuth } from '../middleware/auth.js';
import { NotFoundError } from '../utils/errors.js';
import { BASIC_TEST_AGENT } from '../engine/agents/test-basic.js';
import { FULL_TEST_AGENT } from '../engine/agents/test-full.js';
import { SKILLS_TEST_AGENT } from '../engine/agents/test-skills.js';

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

export async function testRoutes(app: FastifyInstance) {
  const runService = new RunService(
    container.runRepository,
    container.agentRepository,
    container.runManager,
    container.providerConfigRepository,
    container.userSecretRepository
  );

  // Run Basic Test Agent
  app.post('/api/test/basic', {
    schema: {
      tags: ['system'],
      summary: 'Run Basic Test Agent (input → js → if-else → output)',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      body: {
        type: 'object',
        properties: {
          input: {
            type: 'object',
            properties: {
              text: { type: 'string', default: 'Hello' },
              score: { type: 'number', default: 50 },
            },
            additionalProperties: true,
          },
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
        400: errorSchema,
        401: errorSchema,
        404: errorSchema,
      },
    },
    preHandler: requireAuth,
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { input } = request.body as { input?: Record<string, unknown> };

    const agent = await container.agentRepository.findSystemAgentByName(BASIC_TEST_AGENT.name);
    if (!agent) {
      throw new NotFoundError('Basic Test Agent not found. Run server to seed it.');
    }

    const run = await runService.run(userId, agent.id, input ?? { text: 'Hello', score: 50 });

    return reply.send({
      success: true,
      data: run,
    });
  });

  // Run Full Test Agent
  app.post('/api/test/full', {
    schema: {
      tags: ['system'],
      summary: 'Run Full Test Agent (input → js → if-else → http → llm → output)',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      body: {
        type: 'object',
        properties: {
          input: {
            type: 'object',
            properties: {
              text: { type: 'string', default: 'Hello' },
              score: { type: 'number', default: 50 },
            },
            additionalProperties: true,
          },
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
        400: errorSchema,
        401: errorSchema,
        404: errorSchema,
      },
    },
    preHandler: requireAuth,
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { input } = request.body as { input?: Record<string, unknown> };

    const agent = await container.agentRepository.findSystemAgentByName(FULL_TEST_AGENT.name);
    if (!agent) {
      throw new NotFoundError('Full Test Agent not found. Run server to seed it.');
    }

    const run = await runService.run(userId, agent.id, input ?? { text: 'Hello', score: 50 });

    return reply.send({
      success: true,
      data: run,
    });
  });

  // Run Skills Test Agent (LLM with tool calling)
  app.post('/api/test/skills', {
    schema: {
      tags: ['system'],
      summary: 'Run Skills Test Agent (LLM with tool calling to sub-agents)',
      description: 'Tests LLM tool calling functionality. Requires OpenAI API key configured.',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      body: {
        type: 'object',
        properties: {
          input: {
            type: 'object',
            properties: {
              message: { type: 'string', default: 'What is 15 + 27?' },
            },
            additionalProperties: true,
          },
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
        400: errorSchema,
        401: errorSchema,
        404: errorSchema,
      },
    },
    preHandler: requireAuth,
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { input } = request.body as { input?: Record<string, unknown> };

    const agent = await container.agentRepository.findSystemAgentByName(SKILLS_TEST_AGENT.name);
    if (!agent) {
      throw new NotFoundError('Skills Test Agent not found. Run server to seed it.');
    }

    const run = await runService.run(userId, agent.id, input ?? { message: 'What is 15 + 27?' });

    return reply.send({
      success: true,
      data: run,
    });
  });
}
