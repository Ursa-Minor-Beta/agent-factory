import type { IUserRepository } from '../domain/interfaces/repositories/IUserRepository.js';
import type { IApiKeyRepository } from '../domain/interfaces/repositories/IApiKeyRepository.js';
import type { User, UserRole } from '../domain/entities/User.js';
import type { ApiKey, ApiKeyPermission } from '../domain/entities/ApiKey.js';
import { hashPassword, verifyPassword, generateApiKey, hashApiKey } from '../utils/crypto.js';
import { ConflictError, UnauthorizedError, NotFoundError, ForbiddenError } from '../utils/errors.js';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult {
  user: Omit<User, 'passwordHash'>;
  tokens: TokenPair;
}

export interface CreateApiKeyResult {
  apiKey: ApiKey;
  plainKey: string; // Only returned once at creation
}

export class AuthService {
  constructor(
    private userRepo: IUserRepository,
    private apiKeyRepo: IApiKeyRepository,
    private signToken: (payload: object, options?: { expiresIn?: string }) => string
  ) {}

  async createUser(
    adminId: string,
    email: string,
    password: string,
    name: string,
    role: UserRole = 'user'
  ): Promise<Omit<User, 'passwordHash'>> {
    // Verify admin
    const admin = await this.userRepo.findById(adminId);
    if (!admin || admin.role !== 'admin') {
      throw new ForbiddenError('Only admins can create users');
    }

    // Check if user exists
    const existing = await this.userRepo.findByEmail(email);
    if (existing) {
      throw new ConflictError('Email already registered');
    }

    // Create user
    const passwordHash = await hashPassword(password);
    const user = await this.userRepo.create({
      email,
      password,
      name,
      role,
      passwordHash,
    });

    return this.sanitizeUser(user);
  }

  async login(email: string, password: string): Promise<AuthResult> {
    const user = await this.userRepo.findByEmail(email);
    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const tokens = this.generateTokens(user.id, user.role);

    return {
      user: this.sanitizeUser(user),
      tokens,
    };
  }

  async refreshTokens(userId: string): Promise<TokenPair> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    return this.generateTokens(user.id, user.role);
  }

  async getMe(userId: string): Promise<Omit<User, 'passwordHash'>> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new NotFoundError('User');
    }

    return this.sanitizeUser(user);
  }

  async updatePassword(
    adminId: string,
    targetUserId: string,
    newPassword: string
  ): Promise<Omit<User, 'passwordHash'>> {
    // Verify admin
    const admin = await this.userRepo.findById(adminId);
    if (!admin || admin.role !== 'admin') {
      throw new ForbiddenError('Only admins can update user passwords');
    }

    // Find target user
    const targetUser = await this.userRepo.findById(targetUserId);
    if (!targetUser) {
      throw new NotFoundError('User');
    }

    // Update password
    const passwordHash = await hashPassword(newPassword);
    const updated = await this.userRepo.update(targetUserId, { passwordHash });

    return this.sanitizeUser(updated!);
  }

  async createApiKey(
    userId: string,
    name: string,
    permissions: ApiKeyPermission[],
    expiresAt?: Date
  ): Promise<CreateApiKeyResult> {
    const { key, prefix } = generateApiKey();
    const keyHash = await hashApiKey(key);

    const apiKey = await this.apiKeyRepo.create({
      userId,
      name,
      permissions,
      expiresAt: expiresAt ?? null,
      keyHash,
      keyPrefix: prefix,
    });

    return {
      apiKey,
      plainKey: key,
    };
  }

  async listApiKeys(userId: string): Promise<ApiKey[]> {
    return this.apiKeyRepo.findByUserId(userId);
  }

  async revokeApiKey(userId: string, keyId: string): Promise<void> {
    const apiKey = await this.apiKeyRepo.findById(keyId);
    if (!apiKey || apiKey.userId !== userId) {
      throw new NotFoundError('API Key');
    }

    await this.apiKeyRepo.delete(keyId);
  }

  async validateApiKey(key: string): Promise<ApiKey | null> {
    const keyHash = await hashApiKey(key);
    const apiKey = await this.apiKeyRepo.findByKeyHash(keyHash);

    if (!apiKey) {
      return null;
    }

    // Check expiration
    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      return null;
    }

    // Update last used
    await this.apiKeyRepo.updateLastUsed(apiKey.id);

    return apiKey;
  }

  private generateTokens(userId: string, role: UserRole): TokenPair {
    const accessToken = this.signToken({ userId, role }, { expiresIn: '15m' });
    const refreshToken = this.signToken({ userId, role, type: 'refresh' }, { expiresIn: '7d' });

    return { accessToken, refreshToken };
  }

  private sanitizeUser(user: User): Omit<User, 'passwordHash'> {
    const { passwordHash: _, ...sanitized } = user;
    return sanitized;
  }
}
