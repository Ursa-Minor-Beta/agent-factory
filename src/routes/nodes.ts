import { FastifyInstance } from 'fastify';
import { requireAuth } from '../middleware/auth.js';
import { NODE_DEFINITIONS } from '../engine/nodes/definitions.js';

const optionSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    type: { type: 'string', enum: ['string', 'number', 'boolean', 'object', 'enum'] },
    required: { type: 'boolean' },
    description: { type: 'string' },
    values: { type: 'array', items: { type: 'string' } },
    default: {},
  },
};

const exampleSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    description: { type: 'string' },
    data: { type: 'object', additionalProperties: true },
  },
};

const nodeSchema = {
  type: 'object',
  properties: {
    type: { type: 'string' },
    description: { type: 'string' },
    inputs: { type: 'array', items: { type: 'string' } },
    outputs: { type: 'array', items: { type: 'string' } },
    options: { type: 'array', items: optionSchema },
    features: { type: 'array', items: { type: 'string' } },
    examples: { type: 'array', items: exampleSchema },
  },
};

export async function nodeRoutes(app: FastifyInstance) {
  // List available node types
  app.get('/api/nodes', {
    schema: {
      tags: ['nodes'],
      summary: 'List available node types with their configuration options',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'array', items: nodeSchema },
          },
        },
      },
    },
    preHandler: requireAuth,
  }, async () => ({
    success: true,
    data: NODE_DEFINITIONS,
  }));
}
