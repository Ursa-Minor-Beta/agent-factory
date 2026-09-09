import type { FastifyRequest } from 'fastify';
import { UnauthorizedError, ForbiddenError } from '../utils/errors.js';
import { container } from '../config/container.js';
import { hashApiKey } from '../utils/crypto.js';
import type { ApiKeyPermission } from '../domain/entities/ApiKey.js';

export interface AuthenticatedUser {
  userId: string;
  role: string;
  permissions?: ApiKeyPermission[]; // Only set for API key auth
  isApiKey?: boolean;
}

/**
 * Try to authenticate via API key (X-API-Key header)
 */
async function tryApiKeyAuth(request: FastifyRequest): Promise<boolean> {
  const apiKey = request.headers['x-api-key'] as string | undefined;
  if (!apiKey) {
    return false;
  }

  const keyHash = await hashApiKey(apiKey);
  const apiKeyRecord = await container.apiKeyRepository.findByKeyHash(keyHash);

  if (!apiKeyRecord) {
    throw new UnauthorizedError('Invalid API key');
  }

  // Check expiration
  if (apiKeyRecord.expiresAt && apiKeyRecord.expiresAt < new Date()) {
    throw new UnauthorizedError('API key has expired');
  }

  // Get user to determine role
  const user = await container.userRepository.findById(apiKeyRecord.userId);
  if (!user) {
    throw new UnauthorizedError('API key owner not found');
  }

  // Update last used (fire and forget)
  container.apiKeyRepository.updateLastUsed(apiKeyRecord.id).catch(() => {});

  // Set user info on request
  (request as any).user = {
    userId: apiKeyRecord.userId,
    role: user.role,
    permissions: apiKeyRecord.permissions,
    isApiKey: true,
  };

  return true;
}

/**
 * Require valid JWT token, API key, or cookie
 */
export async function requireAuth(request: FastifyRequest): Promise<void> {
  // Try API key first
  const isApiKey = await tryApiKeyAuth(request);
  if (isApiKey) {
    return;
  }

  // Try JWT from Authorization header
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    try {
      await request.jwtVerify();
      return;
    } catch {
      throw new UnauthorizedError('Invalid or expired token');
    }
  }

  // Try JWT from cookie
  const cookieToken = request.cookies?.['accessToken'];
  if (cookieToken) {
    try {
      const decoded = request.server.jwt.verify<{ userId: string; role?: string }>(cookieToken);
      (request as any).user = {
        userId: decoded.userId,
        role: decoded.role ?? 'user',
      };
      return;
    } catch {
      throw new UnauthorizedError('Invalid or expired token');
    }
  }

  throw new UnauthorizedError('Authentication required');
}

/**
 * Require valid JWT token with admin role
 */
export async function requireAdmin(request: FastifyRequest): Promise<void> {
  await requireAuth(request);
  const { role } = request.user as AuthenticatedUser;
  if (role !== 'admin') {
    throw new ForbiddenError('Admin access required');
  }
}

/**
 * Factory to create permission-checking middleware for API keys
 */
export function requirePermission(permission: ApiKeyPermission) {
  return async function (request: FastifyRequest): Promise<void> {
    await requireAuth(request);
    const user = request.user as AuthenticatedUser;

    // JWT auth has all permissions
    if (!user.isApiKey) {
      return;
    }

    // Check API key permissions
    if (!user.permissions?.includes(permission)) {
      throw new ForbiddenError(`Missing permission: ${permission}`);
    }
  };
}
