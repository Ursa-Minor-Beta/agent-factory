import type { IAgentRepository } from '../domain/interfaces/repositories/IAgentRepository.js';
import type { IAgentVersionRepository } from '../domain/interfaces/repositories/IAgentVersionRepository.js';
import type { ISessionRepository } from '../domain/interfaces/repositories/ISessionRepository.js';
import type { IMessageRepository } from '../domain/interfaces/repositories/IMessageRepository.js';
import type {
  Agent,
  CreateAgentDTO,
  UpdateAgentDTO,
  AgentQueryOptions,
  AgentListResult,
  AgentVersion,
  AgentVersionListResult,
} from '../domain/entities/Agent.js';
import { NotFoundError, ForbiddenError } from '../utils/errors.js';

export class AgentService {
  constructor(
    private agentRepo: IAgentRepository,
    private versionRepo?: IAgentVersionRepository,
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

    // Create snapshot before updating
    if (this.versionRepo) {
      await this.versionRepo.createSnapshot(agent);
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
      if (sessions.length > 0) {
        await this.messageRepo.deleteBy({ sessionId: sessions.map((s) => s.id) });
      }
      await this.sessionRepo.deleteBy({ agentId });
    }

    // Delete all versions
    if (this.versionRepo) {
      await this.versionRepo.deleteVersionsByAgentId(agentId);
    }

    await this.agentRepo.delete(agentId);
  }

  async listVersions(
    userId: string,
    agentId: string,
    options?: { skip?: number; limit?: number }
  ): Promise<AgentVersionListResult> {
    if (!this.versionRepo) {
      return { versions: [], total: 0 };
    }

    // Verify user has access to the agent
    const agent = await this.agentRepo.findById(agentId);
    if (!agent) {
      throw new NotFoundError('Agent');
    }
    if (agent.userId !== userId) {
      throw new ForbiddenError('Access denied');
    }

    return this.versionRepo.findVersionsByAgentId(agentId, options);
  }

  async getVersionById(userId: string, versionId: string): Promise<AgentVersion> {
    if (!this.versionRepo) {
      throw new NotFoundError('Version repository not available');
    }

    const version = await this.versionRepo.findVersionById(versionId);
    if (!version) {
      throw new NotFoundError('Version');
    }

    // Verify user has access to the agent
    const agent = await this.agentRepo.findById(version.agentIdRef);
    if (!agent || agent.userId !== userId) {
      throw new ForbiddenError('Access denied');
    }

    return version;
  }

  async restoreVersion(userId: string, versionId: string): Promise<Agent> {
    if (!this.versionRepo) {
      throw new NotFoundError('Version repository not available');
    }

    const version = await this.versionRepo.findVersionById(versionId);
    if (!version) {
      throw new NotFoundError('Version');
    }

    // Verify user has access to the agent
    const agent = await this.agentRepo.findById(version.agentIdRef);
    if (!agent) {
      throw new NotFoundError('Agent');
    }
    if (agent.userId !== userId) {
      throw new ForbiddenError('Access denied');
    }

    // Create snapshot of current state before restoring
    await this.versionRepo.createSnapshot(agent);

    // Restore the version
    const updated = await this.agentRepo.update(version.agentIdRef, {
      name: version.name,
      description: version.description,
      nodes: version.nodes,
      editorData: version.editorData,
      workspaceId: version.workspaceId ?? null,
    });

    if (!updated) {
      throw new NotFoundError('Agent');
    }

    return updated;
  }
}
