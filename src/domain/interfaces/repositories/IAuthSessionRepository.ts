import type { AuthSession, CreateAuthSessionDTO } from '../../entities/AuthSession.js';

export interface IAuthSessionRepository {
  findById(id: string): Promise<AuthSession | null>;
  create(data: CreateAuthSessionDTO): Promise<AuthSession>;
  /** Marks the session as used and extends its expiry */
  touch(id: string, expiresAt: Date): Promise<void>;
  delete(options: { id?: string; userId?: string }): Promise<number>;
}
