import { FastifyInstance } from 'fastify';
import { AuthService } from '../services/auth.service.js';
import { container } from '../config/container.js';
import { requireAuth } from '../middleware/auth.js';
import { UnauthorizedError } from '../utils/errors.js';
import { config } from '../config/index.js';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: config.server.env === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

const ACCESS_TOKEN_MAX_AGE = 15 * 60 * 1000; // 15 minutes
const REFRESH_TOKEN_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

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
    role: { type: 'string', enum: ['admin', 'user'] },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const tokensSchema = {
  type: 'object',
  properties: {
    accessToken: { type: 'string' },
    refreshToken: { type: 'string' },
  },
};

const authResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: {
      type: 'object',
      properties: {
        user: userSchema,
        tokens: tokensSchema,
      },
    },
  },
};

const apiKeySchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    keyPrefix: { type: 'string' },
    permissions: { type: 'array', items: { type: 'string' } },
    lastUsedAt: { type: 'string', format: 'date-time', nullable: true },
    expiresAt: { type: 'string', format: 'date-time', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
  },
};

export async function authRoutes(app: FastifyInstance) {
  const authService = new AuthService(
    container.userRepository,
    container.apiKeyRepository,
    (payload, options) => app.jwt.sign(payload, options)
  );

  // Login
  app.post('/api/auth/login', {
    schema: {
      tags: ['auth'],
      summary: 'Login with email and password',
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string' },
        },
      },
      response: {
        200: authResponseSchema,
        401: errorSchema,
      },
    },
  }, async (request, reply) => {
    const { email, password } = request.body as {
      email: string;
      password: string;
    };

    const result = await authService.login(email, password);

    // Set httpOnly cookies for browser clients
    reply.setCookie('accessToken', result.tokens.accessToken, {
      ...COOKIE_OPTIONS,
      maxAge: ACCESS_TOKEN_MAX_AGE,
    });
    reply.setCookie('refreshToken', result.tokens.refreshToken, {
      ...COOKIE_OPTIONS,
      maxAge: REFRESH_TOKEN_MAX_AGE,
    });

    return reply.send({
      success: true,
      data: result,
    });
  });

  // Refresh token
  app.post('/api/auth/refresh', {
    schema: {
      tags: ['auth'],
      summary: 'Refresh access token',
      description: 'Accepts refreshToken in body or from httpOnly cookie',
      body: {
        type: 'object',
        properties: {
          refreshToken: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: tokensSchema,
          },
        },
        401: errorSchema,
      },
    },
  }, async (request, reply) => {
    const body = request.body as { refreshToken?: string };
    // Accept from body or cookie
    const refreshToken = body.refreshToken || request.cookies['refreshToken'];

    if (!refreshToken) {
      throw new UnauthorizedError('Refresh token required');
    }

    let decoded: { userId: string; type?: string };
    try {
      decoded = app.jwt.verify<{ userId: string; type?: string }>(refreshToken);
    } catch {
      throw new UnauthorizedError('Invalid or expired refresh token');
    }

    if (decoded.type !== 'refresh') {
      throw new UnauthorizedError('Invalid refresh token');
    }

    const tokens = await authService.refreshTokens(decoded.userId);

    // Update cookies
    reply.setCookie('accessToken', tokens.accessToken, {
      ...COOKIE_OPTIONS,
      maxAge: ACCESS_TOKEN_MAX_AGE,
    });
    reply.setCookie('refreshToken', tokens.refreshToken, {
      ...COOKIE_OPTIONS,
      maxAge: REFRESH_TOKEN_MAX_AGE,
    });

    return reply.send({
      success: true,
      data: tokens,
    });
  });

  // Get current user
  app.get('/api/auth/me', {
    schema: {
      tags: ['auth'],
      summary: 'Get current user',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: userSchema,
          },
        },
        401: errorSchema,
      },
    },
    preHandler: requireAuth,
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const user = await authService.getMe(userId);

    return reply.send({
      success: true,
      data: user,
    });
  });

  // Logout (clear cookies)
  app.post('/api/auth/logout', {
    schema: {
      tags: ['auth'],
      summary: 'Logout (clears auth cookies)',
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (_request, reply) => {
    reply.clearCookie('accessToken', { path: '/' });
    reply.clearCookie('refreshToken', { path: '/' });

    return reply.send({
      success: true,
      message: 'Logged out',
    });
  });

  // Create API key
  app.post('/api/auth/api-keys', {
    schema: {
      tags: ['auth'],
      summary: 'Create a new API key',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' },
          permissions: {
            type: 'array',
            items: { type: 'string', enum: ['agents:read', 'agents:write', 'agents:run', 'runs:read'] },
            default: ['agents:read', 'agents:run'],
          },
          expiresAt: { type: 'string', format: 'date-time', nullable: true },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                apiKey: apiKeySchema,
                plainKey: { type: 'string', description: 'Save this! Only shown once.' },
              },
            },
          },
        },
        401: errorSchema,
      },
    },
    preHandler: requireAuth,
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { name, permissions, expiresAt } = request.body as {
      name: string;
      permissions?: string[];
      expiresAt?: string;
    };

    const result = await authService.createApiKey(
      userId,
      name,
      (permissions as any) ?? ['agents:read', 'agents:run'],
      expiresAt ? new Date(expiresAt) : undefined
    );

    return reply.status(201).send({
      success: true,
      data: result,
    });
  });

  // List API keys
  app.get('/api/auth/api-keys', {
    schema: {
      tags: ['auth'],
      summary: 'List all API keys',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'array',
              items: apiKeySchema,
            },
          },
        },
        401: errorSchema,
      },
    },
    preHandler: requireAuth,
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const apiKeys = await authService.listApiKeys(userId);

    return reply.send({
      success: true,
      data: apiKeys,
    });
  });

  // Revoke API key
  app.delete('/api/auth/api-keys/:id', {
    schema: {
      tags: ['auth'],
      summary: 'Revoke an API key',
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
        404: errorSchema,
      },
    },
    preHandler: requireAuth,
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };

    await authService.revokeApiKey(userId, id);

    return reply.send({
      success: true,
      message: 'API key revoked',
    });
  });
}
