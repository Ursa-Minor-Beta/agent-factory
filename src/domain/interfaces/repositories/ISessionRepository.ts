import { Session, CreateSessionDTO, UpdateSessionDTO, SessionStatus } from '../../entities/Session.js';

export interface ISessionRepository {
  findById(id: string): Promise<Session | null>;
  findByUserId(userId: string, options?: { agentId?: string; status?: SessionStatus; limit?: number; offset?: number }): Promise<Session[]>;
  findByAgentId(agentId: string, options?: { userId?: string; limit?: number }): Promise<Session[]>;
  create(data: CreateSessionDTO): Promise<Session>;
  update(id: string, data: UpdateSessionDTO): Promise<Session | null>;
  /**
   * Delete sessions by ID(s), agentId(s), or userId.
   * At least one parameter must be provided.
   * Returns the number of deleted documents.
   */
  deleteBy(options: { id?: string | string[]; agentId?: string | string[]; userId?: string }): Promise<number>;
  archive(id: string): Promise<Session | null>;
  count(userId: string): Promise<number>;
}
