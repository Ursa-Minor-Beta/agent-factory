import type { IAgentRepository } from '../domain/interfaces/repositories/IAgentRepository.js';
import type { Agent, CreateAgentDTO, UpdateAgentDTO } from '../domain/entities/Agent.js';
import { NotFoundError, ForbiddenError } from '../utils/errors.js';

export class AgentService {
  constructor(private agentRepo: IAgentRepository) {}

  async create(userId: string, data: Omit<CreateAgentDTO, 'userId'>): Promise<Agent> {
    return this.agentRepo.create({ ...data, userId });
  }

  async list(userId: string): Promise<Agent[]> {
    return this.agentRepo.findByUserId(userId);
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

    await this.agentRepo.delete(agentId);
  }
}
