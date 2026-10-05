import type { FastifyInstance } from 'fastify';
import { WorkspaceService } from '../services/workspace.service.js';
import { container } from '../config/container.js';
import { requireAuth } from '../middleware/auth.js';
import type { AuthenticatedUser } from '../middleware/auth.js';
import type { WorkspaceQueryOptions } from '../domain/entities/Workspace.js';

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

const workspaceSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    userId: { type: 'string' },
    name: { type: 'string' },
    description: { type: 'string', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

export async function workspaceRoutes(app: FastifyInstance) {
  const workspaceService = new WorkspaceService({
    workspaceRepo: container.workspaceRepository,
    agentRepo: container.agentRepository,
    userSecretRepo: container.userSecretRepository,
    providerConfigRepo: container.providerConfigRepository,
    memorySchemaRepo: container.memorySchemaRepository,
  });

  // List workspaces
  app.get(
    '/api/workspaces',
    {
      onRequest: [requireAuth],
      schema: {
        description: 'List user workspaces with optional filtering, sorting, and pagination',
        tags: ['workspaces'],
        querystring: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            sortBy: { type: 'string', enum: ['name', 'createdAt', 'updatedAt'] },
            sortOrder: { type: 'string', enum: ['asc', 'desc'] },
            skip: { type: 'number', minimum: 0 },
            limit: { type: 'number', minimum: 1, maximum: 100 },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              workspaces: { type: 'array', items: workspaceSchema },
              total: { type: 'number' },
              skip: { type: 'number' },
              limit: { type: 'number' },
            },
          },
          401: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const user = request.user as AuthenticatedUser;
      const query = request.query as {
        name?: string;
        sortBy?: 'name' | 'createdAt' | 'updatedAt';
        sortOrder?: 'asc' | 'desc';
        skip?: number;
        limit?: number;
      };

      const queryOptions: WorkspaceQueryOptions = {
        name: query.name,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
        skip: query.skip,
        limit: query.limit,
      };

      const result = await workspaceService.list(user.userId, queryOptions);
      return reply.send(result);
    }
  );

  // Create workspace
  app.post(
    '/api/workspaces',
    {
      onRequest: [requireAuth],
      schema: {
        description: 'Create a new workspace',
        tags: ['workspaces'],
        body: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 255 },
            description: { type: 'string', maxLength: 1000 },
          },
        },
        response: {
          200: workspaceSchema,
          400: errorSchema,
          401: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const user = request.user as AuthenticatedUser;
      const { name, description } = request.body as { name: string; description?: string };

      const workspace = await workspaceService.create(user.userId, { name, description });
      return reply.send(workspace);
    }
  );

  // Get workspace by ID
  app.get(
    '/api/workspaces/:id',
    {
      onRequest: [requireAuth],
      schema: {
        description: 'Get workspace by ID',
        tags: ['workspaces'],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
        },
        response: {
          200: workspaceSchema,
          401: errorSchema,
          403: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const user = request.user as AuthenticatedUser;
      const { id } = request.params as { id: string };

      const workspace = await workspaceService.getById(user.userId, id);
      return reply.send(workspace);
    }
  );

  // Update workspace
  app.put(
    '/api/workspaces/:id',
    {
      onRequest: [requireAuth],
      schema: {
        description: 'Update workspace',
        tags: ['workspaces'],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 255 },
            description: { type: 'string', maxLength: 1000 },
          },
        },
        response: {
          200: workspaceSchema,
          400: errorSchema,
          401: errorSchema,
          403: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const user = request.user as AuthenticatedUser;
      const { id } = request.params as { id: string };
      const { name, description } = request.body as { name?: string; description?: string };

      const workspace = await workspaceService.update(user.userId, id, { name, description });
      return reply.send(workspace);
    }
  );

  // Delete workspace
  app.delete(
    '/api/workspaces/:id',
    {
      onRequest: [requireAuth],
      schema: {
        description: 'Delete workspace with option to delete or move agents',
        tags: ['workspaces'],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
        },
        querystring: {
          type: 'object',
          properties: {
            mode: {
              type: 'string',
              enum: ['move-agents', 'delete-agents'],
              default: 'move-agents',
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
            },
          },
          400: errorSchema,
          401: errorSchema,
          403: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const user = request.user as AuthenticatedUser;
      const { id } = request.params as { id: string };
      const { mode = 'move-agents' } = request.query as { mode?: 'move-agents' | 'delete-agents' };

      await workspaceService.delete(user.userId, id, mode);
      return reply.send({ success: true });
    }
  );

  // Get agent count for workspace
  app.get(
    '/api/workspaces/:id/agent-count',
    {
      onRequest: [requireAuth],
      schema: {
        description: 'Get number of agents in workspace',
        tags: ['workspaces'],
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
              count: { type: 'number' },
            },
          },
          401: errorSchema,
          403: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const user = request.user as AuthenticatedUser;
      const { id } = request.params as { id: string };

      const count = await workspaceService.getAgentCount(user.userId, id);
      return reply.send({ count });
    }
  );
}
