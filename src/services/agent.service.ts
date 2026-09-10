import type { IAgentRepository } from '../domain/interfaces/repositories/IAgentRepository.js';
import type { ISessionRepository } from '../domain/interfaces/repositories/ISessionRepository.js';
import type { IMessageRepository } from '../domain/interfaces/repositories/IMessageRepository.js';
import type {
  Agent,
  CreateAgentDTO,
  UpdateAgentDTO,
  AgentQueryOptions,
  AgentListResult,
} from '../domain/entities/Agent.js';
import { NotFoundError, ForbiddenError } from '../utils/errors.js';

export class AgentService {
  constructor(
    private agentRepo: IAgentRepository,
    private sessionRepo?: ISessionRepository,
    private messageRepo?: IMessageRepository
  ) {}

  async create(userId: string, data: Omit<CreateAgentDTO, 'userId'>): Promise<Agent> {
    return this.agentRepo.create({ ...data, userId });
  }

  async list(userId: string, options?: AgentQueryOptions): Promise<AgentListResult> {
    return this.agentRepo.findByUserId(userId, options);
  }

  async getById(userId: string, agentId: string): Promise<Agent> {
    const agent = await this.agentRepo.findById(agentId);
    if (!agent) {
      throw new NotFoundError('Agent');
    }
    if (agent.userId !== userId) {
      throw new ForbiddenError('Access denied');
    }
    return agent;
  }

  async update(userId: string, agentId: string, data: UpdateAgentDTO): Promise<Agent> {
    const agent = await this.agentRepo.findById(agentId);
    if (!agent) {
      throw new NotFoundError('Agent');
    }
    if (agent.userId !== userId) {
      throw new ForbiddenError('Access denied');
    }

    // Prevent name change for system agents
    if (agent.isSystem && data.name !== undefined) {
      delete data.name;
    }

    const updated = await this.agentRepo.update(agentId, data);
    if (!updated) {
      throw new NotFoundError('Agent');
    }
    return updated;
  }

  async delete(userId: string, agentId: string): Promise<void> {
    const agent = await this.agentRepo.findById(agentId);
    if (!agent) {
      throw new NotFoundError('Agent');
    }
    if (agent.userId !== userId) {
      throw new ForbiddenError('Access denied');
    }

    // Cascade delete sessions and messages
    if (this.sessionRepo && this.messageRepo) {
      const sessions = await this.sessionRepo.findByAgentId(agentId);
      for (const session of sessions) {
        await this.messageRepo.deleteBySessionId(session.id);
      }
      await this.sessionRepo.deleteByAgentId(agentId);
    }

    await this.agentRepo.delete(agentId);
  }
}
