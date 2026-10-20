import { FastifyInstance } from 'fastify';
import { AuthService } from '../services/auth.service.js';
import { container } from '../config/container.js';
import { requireAdmin } from '../middleware/auth.js';
import { USER_ROLES } from '../domain/entities/User.js';

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

const userSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    email: { type: 'string', format: 'email' },
    name: { type: 'string' },
    role: { type: 'string', enum: USER_ROLES as unknown as string[] },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

export async function userRoutes(app: FastifyInstance) {
  const authService = new AuthService(
    container.userRepository,
    container.apiKeyRepository,
    (payload, options) => app.jwt.sign(payload, options)
  );

  // List users with pagination and filtering (admin only)
  app.get('/api/users', {
    schema: {
      tags: ['users'],
      summary: 'List users with pagination and filtering (admin only)',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      querystring: {
        type: 'object',
        properties: {
          email: { type: 'string', description: 'Filter by email (partial match)' },
          name: { type: 'string', description: 'Filter by name (partial match)' },
          skip: { type: 'integer', minimum: 0, default: 0 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
          sortBy: { type: 'string', enum: ['createdAt', 'email', 'name'], default: 'createdAt' },
          sortOrder: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
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
                users: { type: 'array', items: userSchema },
                total: { type: 'integer' },
                skip: { type: 'integer' },
                limit: { type: 'integer' },
              },
            },
          },
        },
        403: errorSchema,
      },
    },
    preHandler: requireAdmin,
  }, async (request, reply) => {
    const { email, name, skip, limit, sortBy, sortOrder } = request.query as {
      email?: string;
      name?: string;
      skip?: number;
      limit?: number;
      sortBy?: 'createdAt' | 'email' | 'name';
      sortOrder?: 'asc' | 'desc';
    };

    const result = await container.userRepository.findAll({
      email,
      name,
      skip: skip ?? 0,
      limit: limit ?? 50,
      sortBy,
      sortOrder,
    });

    return reply.send({
      success: true,
      data: {
        users: result.users.map((u) => ({
          id: u.id,
          email: u.email,
          name: u.name,
          role: u.role,
          createdAt: u.createdAt,
          updatedAt: u.updatedAt,
        })),
        total: result.total,
        skip: skip ?? 0,
        limit: limit ?? 50,
      },
    });
  });

  // Create user (admin only)
  app.post('/api/users', {
    schema: {
      tags: ['users'],
      summary: 'Create a new user (admin only)',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      body: {
        type: 'object',
        required: ['email', 'password', 'name'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 8 },
          name: { type: 'string', minLength: 1 },
          role: { type: 'string', enum: USER_ROLES as unknown as string[], default: 'user' },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: userSchema,
          },
        },
        400: errorSchema,
        403: errorSchema,
        409: errorSchema,
      },
    },
    preHandler: requireAdmin,
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { email, password, name, role } = request.body as {
      email: string;
      password: string;
      name: string;
      role?: 'admin' | 'user';
    };

    const user = await authService.createUser(userId, email, password, name, role);

    return reply.status(201).send({
      success: true,
      data: user,
    });
  });

  // Update user password (admin only)
  app.put('/api/users/:id/password', {
    schema: {
      tags: ['users'],
      summary: 'Update user password (admin only)',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
      },
      body: {
        type: 'object',
        required: ['password'],
        properties: {
          password: { type: 'string', minLength: 8 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: userSchema,
          },
        },
        400: errorSchema,
        403: errorSchema,
        404: errorSchema,
      },
    },
    preHandler: requireAdmin,
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };
    const { password } = request.body as { password: string };

    const user = await authService.updatePassword(userId, id, password);

    return reply.send({
      success: true,
      data: user,
    });
  });

  // Delete user and all connected entities except runs (admin only)
  app.delete('/api/users/:id', {
    schema: {
      tags: ['users'],
      summary: 'Delete a user and all connected entities except runs (admin only)',
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
            deleted: {
              type: 'object',
              properties: {
                apiKeys: { type: 'integer' },
                agents: { type: 'integer' },
                workspaces: { type: 'integer' },
                sessions: { type: 'integer' },
                messages: { type: 'integer' },
                files: { type: 'integer' },
                secrets: { type: 'integer' },
                providerConfigs: { type: 'integer' },
                gitHubSyncs: { type: 'integer' },
                memorySchemas: { type: 'integer' },
                memoryRecords: { type: 'integer' },
              },
            },
          },
        },
        400: errorSchema,
        403: errorSchema,
        404: errorSchema,
      },
    },
    preHandler: requireAdmin,
  }, async (request, reply) => {
    const { userId: adminUserId } = request.user as { userId: string };
    const { id: targetUserId } = request.params as { id: string };

    // Cannot delete yourself
    if (adminUserId === targetUserId) {
      return reply.status(400).send({
        success: false,
        error: { code: 'SELF_DELETE', message: 'Cannot delete your own account' },
      });
    }

    // Check user exists
    const user = await container.userRepository.findById(targetUserId);
    if (!user) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'User not found' },
      });
    }

    // Get sessions for message deletion
    const sessions = await container.sessionRepository.findByUserId(targetUserId);
    const sessionIds = sessions.map((s) => s.id);

    // Get memory schemas for record deletion
    const schemas = await container.memorySchemaRepository.findByUserId(targetUserId);
    const schemaIds = schemas.map((s) => s.id);

    // Delete all connected entities in parallel (except runs)
    const [
      apiKeysDeleted,
      agentsDeleted,
      workspacesDeleted,
      sessionsDeleted,
      messagesDeleted,
      filesDeleted,
      secretsDeleted,
      providerConfigsDeleted,
      gitHubSyncsDeleted,
      memorySchemasDeleted,
      ...memoryRecordsDeleted
    ] = await Promise.all([
      container.apiKeyRepository.delete({ userId: targetUserId }),
      container.agentRepository.delete({ userId: targetUserId }),
      container.workspaceRepository.delete({ userId: targetUserId }),
      container.sessionRepository.deleteBy({ userId: targetUserId }),
      sessionIds.length > 0
        ? container.messageRepository.deleteBy({ sessionId: sessionIds })
        : Promise.resolve(0),
      container.fileRepository.deleteBy({ userId: targetUserId }),
      container.userSecretRepository.delete({ userId: targetUserId }),
      container.providerConfigRepository.delete({ userId: targetUserId }),
      container.gitHubSyncRepository.delete({ userId: targetUserId }),
      container.memorySchemaRepository.delete({ userId: targetUserId }),
      ...schemaIds.map((schemaId) => container.memoryStoreRepository.deleteBySchemaId(schemaId)),
    ]);

    // Delete the user
    await container.userRepository.delete(targetUserId);

    const totalMemoryRecords = memoryRecordsDeleted.reduce((sum, count) => sum + count, 0);

    return reply.send({
      success: true,
      message: `User ${user.email} and all connected entities deleted`,
      deleted: {
        apiKeys: apiKeysDeleted,
        agents: agentsDeleted,
        workspaces: workspacesDeleted,
        sessions: sessionsDeleted,
        messages: messagesDeleted,
        files: filesDeleted,
        secrets: secretsDeleted,
        providerConfigs: providerConfigsDeleted,
        gitHubSyncs: gitHubSyncsDeleted,
        memorySchemas: memorySchemasDeleted,
        memoryRecords: totalMemoryRecords,
      },
    });
  });
}
