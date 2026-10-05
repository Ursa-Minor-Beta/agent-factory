import type { IWorkspaceRepository } from '../domain/interfaces/repositories/IWorkspaceRepository.js';
import type { IAgentRepository } from '../domain/interfaces/repositories/IAgentRepository.js';
import type { IUserSecretRepository } from '../domain/interfaces/repositories/IUserSecretRepository.js';
import type { IProviderConfigRepository } from '../domain/interfaces/repositories/IProviderConfigRepository.js';
import type { IMemorySchemaRepository } from '../domain/interfaces/repositories/IMemorySchemaRepository.js';
import type {
  Workspace,
  CreateWorkspaceDTO,
  UpdateWorkspaceDTO,
  WorkspaceQueryOptions,
  WorkspaceListResult,
} from '../domain/entities/Workspace.js';
import { NotFoundError, ForbiddenError, ValidationError } from '../utils/errors.js';

export type WorkspaceDeletionMode = 'move-agents' | 'delete-agents';

export interface WorkspaceServiceDependencies {
  workspaceRepo: IWorkspaceRepository;
  agentRepo?: IAgentRepository;
  userSecretRepo?: IUserSecretRepository;
  providerConfigRepo?: IProviderConfigRepository;
  memorySchemaRepo?: IMemorySchemaRepository;
}

export class WorkspaceService {
  private workspaceRepo: IWorkspaceRepository;
  private agentRepo?: IAgentRepository;
  private userSecretRepo?: IUserSecretRepository;
  private providerConfigRepo?: IProviderConfigRepository;
  private memorySchemaRepo?: IMemorySchemaRepository;

  constructor(deps: WorkspaceServiceDependencies) {
    this.workspaceRepo = deps.workspaceRepo;
    this.agentRepo = deps.agentRepo;
    this.userSecretRepo = deps.userSecretRepo;
    this.providerConfigRepo = deps.providerConfigRepo;
    this.memorySchemaRepo = deps.memorySchemaRepo;
  }

  async create(userId: string, data: Omit<CreateWorkspaceDTO, 'userId'>): Promise<Workspace> {
    return this.workspaceRepo.create({ ...data, userId });
  }

  async list(userId: string, options?: WorkspaceQueryOptions): Promise<WorkspaceListResult> {
    return this.workspaceRepo.findByUserId(userId, options);
  }

  async getById(userId: string, workspaceId: string): Promise<Workspace> {
    const workspace = await this.workspaceRepo.findById(workspaceId);
    if (!workspace) {
      throw new NotFoundError('Workspace');
    }
    if (workspace.userId !== userId) {
      throw new ForbiddenError('Access denied');
    }
    return workspace;
  }

  async update(userId: string, workspaceId: string, data: UpdateWorkspaceDTO): Promise<Workspace> {
    const workspace = await this.workspaceRepo.findById(workspaceId);
    if (!workspace) {
      throw new NotFoundError('Workspace');
    }
    if (workspace.userId !== userId) {
      throw new ForbiddenError('Access denied');
    }

    const updated = await this.workspaceRepo.update(workspaceId, data);
    if (!updated) {
      throw new NotFoundError('Workspace');
    }
    return updated;
  }

  async delete(
    userId: string,
    workspaceId: string,
    mode: WorkspaceDeletionMode = 'move-agents'
  ): Promise<void> {
    const workspace = await this.workspaceRepo.findById(workspaceId);
    if (!workspace) {
      throw new NotFoundError('Workspace');
    }
    if (workspace.userId !== userId) {
      throw new ForbiddenError('Access denied');
    }

    if (!this.agentRepo) {
      throw new ValidationError('Agent repository not configured');
    }

    // Get agents in this workspace
    const agentsResult = await this.agentRepo.findByUserId(userId, { workspaceId });
    const agents = agentsResult.agents;

    if (mode === 'delete-agents') {
      // Delete all agents in the workspace
      for (const agent of agents) {
        await this.agentRepo.delete(agent.id);
      }
    } else {
      // Move agents to root (remove workspaceId)
      for (const agent of agents) {
        await this.agentRepo.update(agent.id, { workspaceId: null });
      }
    }

    // Delete workspace-scoped resources
    await Promise.all([
      this.userSecretRepo?.deleteByWorkspaceId(workspaceId),
      this.providerConfigRepo?.deleteByWorkspaceId(workspaceId),
      this.memorySchemaRepo?.deleteByWorkspaceId(workspaceId),
    ]);

    // Delete the workspace
    await this.workspaceRepo.delete(workspaceId);
  }

  async getAgentCount(userId: string, workspaceId: string): Promise<number> {
    const workspace = await this.workspaceRepo.findById(workspaceId);
    if (!workspace) {
      throw new NotFoundError('Workspace');
    }
    if (workspace.userId !== userId) {
      throw new ForbiddenError('Access denied');
    }

    return this.workspaceRepo.countAgentsInWorkspace(workspaceId);
  }
}
