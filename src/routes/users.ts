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
