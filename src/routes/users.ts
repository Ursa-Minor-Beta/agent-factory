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
}
