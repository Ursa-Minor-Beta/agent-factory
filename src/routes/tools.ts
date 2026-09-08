import { FastifyInstance } from 'fastify';
import { BUILTIN_TOOLS } from '../engine/tools/index.js';

export async function toolRoutes(app: FastifyInstance) {
  // List all available built-in tools
  app.get('/api/tools', {
    schema: {
      tags: ['tools'],
      summary: 'List available built-in tools',
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string' },
                  name: { type: 'string' },
                  description: { type: 'string' },
                  parameters: { type: 'object' },
                },
              },
            },
          },
        },
      },
    },
  }, async (_request, reply) => {
    const tools = Object.values(BUILTIN_TOOLS);

    return reply.send({
      success: true,
      data: tools,
    });
  });
}
