import { Session, CreateSessionDTO, UpdateSessionDTO, SessionStatus } from '../../entities/Session.js';

export interface ISessionRepository {
  findById(id: string): Promise<Session | null>;
  findByUserId(userId: string, options?: { agentId?: string; status?: SessionStatus; limit?: number; offset?: number }): Promise<Session[]>;
  findByAgentId(agentId: string, options?: { userId?: string; limit?: number }): Promise<Session[]>;
  create(data: CreateSessionDTO): Promise<Session>;
  update(id: string, data: UpdateSessionDTO): Promise<Session | null>;
  delete(id: string): Promise<boolean>;
  deleteByAgentId(agentId: string): Promise<number>;
  archive(id: string): Promise<Session | null>;
  count(userId: string): Promise<number>;
}
