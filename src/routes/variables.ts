import { FastifyInstance } from 'fastify';
import { UserVariableService } from '../services/user-variable.service.js';
import { container } from '../config/container.js';
import { requireAuth } from '../middleware/auth.js';
import type { UserVariableQueryOptions } from '../domain/interfaces/repositories/IUserVariableRepository.js';

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

const variableSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    value: { type: 'string' },
    description: { type: 'string' },
    workspaceId: { type: 'string', nullable: true },
    workspaceName: { type: 'string', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

export async function variableRoutes(app: FastifyInstance) {
  const userVariableService = new UserVariableService(container.userVariableRepository);

  // Get all variables
  app.get('/api/variables', {
    schema: {
      tags: ['variables'],
      summary: 'List all user variables',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      querystring: {
        type: 'object',
        properties: {
          workspaceId: {
            type: 'string',
            description: 'Filter by workspace ID. Omit for all, "null" for global only, or ID for workspace only.',
          },
          name: { type: 'string', description: 'Filter by name (contains, case-insensitive)' },
          sortBy: { type: 'string', enum: ['name', 'createdAt', 'updatedAt'], default: 'updatedAt' },
          sortOrder: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'array', items: variableSchema },
          },
        },
        401: errorSchema,
      },
    },
    preHandler: requireAuth,
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const query = request.query as {
      workspaceId?: string;
      name?: string;
      sortBy?: 'name' | 'createdAt' | 'updatedAt';
      sortOrder?: 'asc' | 'desc';
    };

    const options: UserVariableQueryOptions = {
      name: query.name,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    };
    if (query.workspaceId === 'null') {
      options.workspaceId = null;
    }
    else if (query.workspaceId) {
      options.workspaceId = query.workspaceId;
    }

    const variables = await userVariableService.getAll(userId, options);

    const result = variables.map((s) => ({
      id: s.id,
      name: s.name,
      value: s.value,
      description: s.description,
      workspaceId: s.workspaceId ?? null,
      workspaceName: s.workspaceName ?? null,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));

    return reply.send({ success: true, data: result });
  });

  // Get variable by ID
  app.get('/api/variables/:id', {
    schema: {
      tags: ['variables'],
      summary: 'Get a specific variable',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      params: {
        type: 'object',
        properties: { id: { type: 'string' } },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: variableSchema,
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

    const variable = await userVariableService.getById(userId, id);

    return reply.send({
      success: true,
      data: {
        id: variable.id,
        name: variable.name,
        value: variable.value,
        description: variable.description,
        workspaceId: variable.workspaceId ?? null,
        workspaceName: variable.workspaceName ?? null,
        createdAt: variable.createdAt,
        updatedAt: variable.updatedAt,
      },
    });
  });

  // Create variable
  app.post('/api/variables', {
    schema: {
      tags: ['variables'],
      summary: 'Create a new variable',
      description: 'Create a plain-text variable that can be referenced in any node input using {{var:NAME}} syntax',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      body: {
        type: 'object',
        required: ['name', 'value'],
        properties: {
          name: {
            type: 'string',
            pattern: '^[a-zA-Z_][a-zA-Z0-9_]*$',
            description: 'Variable name (alphanumeric + underscore, must start with letter/underscore)',
          },
          value: {
            type: 'string',
            minLength: 1,
            description: 'Variable value (stored in plain text)',
          },
          description: {
            type: 'string',
            description: 'Optional description',
          },
          workspaceId: {
            type: 'string',
            description: 'Workspace ID to scope the variable to. Omit for global scope.',
          },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: variableSchema,
          },
        },
        400: errorSchema,
        401: errorSchema,
        409: errorSchema,
      },
    },
    preHandler: requireAuth,
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const body = request.body as {
      name: string;
      value: string;
      description?: string;
      workspaceId?: string;
    };

    const variable = await userVariableService.create(userId, body);

    return reply.status(201).send({
      success: true,
      data: {
        id: variable.id,
        name: variable.name,
        value: variable.value,
        description: variable.description,
        workspaceId: variable.workspaceId ?? null,
        workspaceName: variable.workspaceName ?? null,
        createdAt: variable.createdAt,
        updatedAt: variable.updatedAt,
      },
    });
  });

  // Update variable
  app.patch('/api/variables/:id', {
    schema: {
      tags: ['variables'],
      summary: 'Update a variable',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      params: {
        type: 'object',
        properties: { id: { type: 'string' } },
      },
      body: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            pattern: '^[a-zA-Z_][a-zA-Z0-9_]*$',
          },
          value: {
            type: 'string',
            minLength: 1,
          },
          description: {
            type: 'string',
          },
          workspaceId: {
            type: 'string',
            nullable: true,
            description: 'Workspace ID to scope the variable to. Set to null for global scope.',
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: variableSchema,
          },
        },
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        409: errorSchema,
      },
    },
    preHandler: requireAuth,
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };
    const body = request.body as {
      name?: string;
      value?: string;
      description?: string;
      workspaceId?: string | null;
    };

    const variable = await userVariableService.update(userId, id, body);

    return reply.send({
      success: true,
      data: {
        id: variable.id,
        name: variable.name,
        value: variable.value,
        description: variable.description,
        workspaceId: variable.workspaceId ?? null,
        workspaceName: variable.workspaceName ?? null,
        createdAt: variable.createdAt,
        updatedAt: variable.updatedAt,
      },
    });
  });

  // Delete variable
  app.delete('/api/variables/:id', {
    schema: {
      tags: ['variables'],
      summary: 'Delete a variable',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      params: {
        type: 'object',
        properties: { id: { type: 'string' } },
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

    await userVariableService.delete(userId, id);

    return reply.send({ success: true, message: 'Variable deleted' });
  });
}
