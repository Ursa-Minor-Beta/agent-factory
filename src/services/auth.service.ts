import type { IUserRepository } from '../domain/interfaces/repositories/IUserRepository.js';
import type { IApiKeyRepository } from '../domain/interfaces/repositories/IApiKeyRepository.js';
import type { IAuthSessionRepository } from '../domain/interfaces/repositories/IAuthSessionRepository.js';
import type { User, UserRole } from '../domain/entities/User.js';
import type { ApiKey, ApiKeyPermission } from '../domain/entities/ApiKey.js';
import { hashPassword, verifyPassword, generateApiKey, hashApiKey } from '../utils/crypto.js';
import { AppError, ConflictError, UnauthorizedError, NotFoundError, ForbiddenError } from '../utils/errors.js';
import { config } from '../config/index.js';

// Compared against when the email is unknown, so response time doesn't reveal which accounts exist
const dummyPasswordHash = hashPassword('timing-equalization-dummy');

// Login attempts (single instance, so in-memory is enough). Shared by all AuthService instances.
// The configured limit applies per email + IP, so guessing from one address can't lock the real user out.
// A looser per-email limit caps guessing spread over many addresses.
const loginAttemptsByEmailAndIp = new Map<string, number[]>();
const loginAttemptsByEmail = new Map<string, number[]>();
const EMAIL_LIMIT_MULTIPLIER = 10;
const MAX_TRACKED_KEYS = 10_000;

// Matches the refresh token lifetime; extended on every refresh
const AUTH_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function loginAttemptKey(email: string, ip: string | undefined): string {
  return `${ip ?? 'unknown'}\n${email}`;
}

function registerLoginAttempt(email: string, ip: string | undefined): void {
  const now = Date.now();
  const { loginMaxAttempts, loginWindowMs } = config.auth;
  const pairKey = loginAttemptKey(email, ip);
  const pairRecent = (loginAttemptsByEmailAndIp.get(pairKey) ?? []).filter((t) => now - t < loginWindowMs);
  const emailRecent = (loginAttemptsByEmail.get(email) ?? []).filter((t) => now - t < loginWindowMs);
  loginAttemptsByEmailAndIp.set(pairKey, pairRecent);
  loginAttemptsByEmail.set(email, emailRecent);

  // Rejected attempts aren't counted, so a blocked address can't run up the per-email limit
  if (pairRecent.length >= loginMaxAttempts || emailRecent.length >= loginMaxAttempts * EMAIL_LIMIT_MULTIPLIER) {
    throw new AppError('Too many login attempts, try again later', 429, 'RATE_LIMITED');
  }
  // Counted before the password check, so parallel guesses can't all slip through
  pairRecent.push(now);
  emailRecent.push(now);

  for (const attempts of [loginAttemptsByEmailAndIp, loginAttemptsByEmail]) {
    if (attempts.size > MAX_TRACKED_KEYS) {
      for (const [key, times] of attempts) {
        if (times.every((t) => now - t >= loginWindowMs)) attempts.delete(key);
      }
    }
  }
}

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
    private authSessionRepo: IAuthSessionRepository,
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

  async login(email: string, password: string, userAgent?: string, ip?: string): Promise<AuthResult> {
    const emailKey = email.trim().toLowerCase();
    registerLoginAttempt(emailKey, ip);

    const user = await this.userRepo.findByEmail(email);
    const valid = await verifyPassword(password, user?.passwordHash ?? await dummyPasswordHash);
    if (!user || !valid) {
      throw new UnauthorizedError('Invalid email or password');
    }

    // Only this address's count resets; the per-email limit runs out its window
    loginAttemptsByEmailAndIp.delete(loginAttemptKey(emailKey, ip));
    const session = await this.authSessionRepo.create({
      userId: user.id,
      userAgent: userAgent?.slice(0, 512) ?? null,
      expiresAt: new Date(Date.now() + AUTH_SESSION_TTL_MS),
    });
    const tokens = this.generateTokens(user, session.id);

    return {
      user: this.sanitizeUser(user),
      tokens,
    };
  }

  async refreshTokens(userId: string, sessionId: string): Promise<TokenPair> {
    const session = await this.authSessionRepo.findById(sessionId);
    if (!session || session.userId !== userId || session.expiresAt < new Date()) {
      throw new UnauthorizedError('Session has been revoked or expired');
    }

    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    await this.authSessionRepo.touch(sessionId, new Date(Date.now() + AUTH_SESSION_TTL_MS));
    return this.generateTokens(user, sessionId);
  }

  /** Signs out one device: that session's refresh tokens stop working */
  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const session = await this.authSessionRepo.findById(sessionId);
    if (session && session.userId === userId) {
      await this.authSessionRepo.delete({ id: sessionId });
    }
  }

  /** Signs the user out on every device */
  async revokeAllSessions(userId: string): Promise<void> {
    await this.authSessionRepo.delete({ userId });
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
    await this.revokeAllSessions(targetUserId);

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

    await this.apiKeyRepo.delete({ id: keyId });
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

  private generateTokens(user: User, sessionId: string): TokenPair {
    const { id: userId, role } = user;
    const accessToken = this.signToken({ userId, role }, { expiresIn: '15m' });
    const refreshToken = this.signToken({ userId, role, type: 'refresh', sid: sessionId }, { expiresIn: '7d' });

    return { accessToken, refreshToken };
  }

  private sanitizeUser(user: User): Omit<User, 'passwordHash'> {
    const { passwordHash: _, ...sanitized } = user;
    return sanitized;
  }
}
