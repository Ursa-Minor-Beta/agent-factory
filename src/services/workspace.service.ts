import type { IWorkspaceRepository } from '../domain/interfaces/repositories/IWorkspaceRepository.js';
import type { IAgentRepository } from '../domain/interfaces/repositories/IAgentRepository.js';
import type { IUserSecretRepository } from '../domain/interfaces/repositories/IUserSecretRepository.js';
import type { IProviderConfigRepository } from '../domain/interfaces/repositories/IProviderConfigRepository.js';
import type { IMemorySchemaRepository } from '../domain/interfaces/repositories/IMemorySchemaRepository.js';
import type { IMemoryStoreRepository } from '../domain/interfaces/repositories/IMemoryStoreRepository.js';
import type {
  Workspace,
  CreateWorkspaceDTO,
  UpdateWorkspaceDTO,
  WorkspaceQueryOptions,
  WorkspaceListResult,
} from '../domain/entities/Workspace.js';
import { NotFoundError, ForbiddenError } from '../utils/errors.js';

export interface WorkspaceServiceDependencies {
  workspaceRepo: IWorkspaceRepository;
  agentRepo: IAgentRepository;
  userSecretRepo: IUserSecretRepository;
  providerConfigRepo: IProviderConfigRepository;
  memorySchemaRepo: IMemorySchemaRepository;
  memoryStoreRepo: IMemoryStoreRepository;
}

export class WorkspaceService {
  private workspaceRepo: IWorkspaceRepository;
  private agentRepo: IAgentRepository;
  private userSecretRepo: IUserSecretRepository;
  private providerConfigRepo: IProviderConfigRepository;
  private memorySchemaRepo: IMemorySchemaRepository;
  private memoryStoreRepo: IMemoryStoreRepository;

  constructor(deps: WorkspaceServiceDependencies) {
    this.workspaceRepo = deps.workspaceRepo;
    this.agentRepo = deps.agentRepo;
    this.userSecretRepo = deps.userSecretRepo;
    this.providerConfigRepo = deps.providerConfigRepo;
    this.memorySchemaRepo = deps.memorySchemaRepo;
    this.memoryStoreRepo = deps.memoryStoreRepo;
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

  async delete(userId: string, workspaceId: string): Promise<void> {
    const workspace = await this.workspaceRepo.findById(workspaceId);
    if (!workspace) {
      throw new NotFoundError('Workspace');
    }
    if (workspace.userId !== userId) {
      throw new ForbiddenError('Access denied');
    }

    // Get schemas in this workspace (for memory record cleanup)
    const schemas = await this.memorySchemaRepo.findByUserId(userId, { workspaceId });

    // Delete all resources in parallel
    await Promise.all([
      this.agentRepo.deleteByWorkspaceId(workspaceId),
      ...schemas.map((schema) => this.memoryStoreRepo.deleteBySchemaId(schema.id)),
      this.userSecretRepo.deleteByWorkspaceId(workspaceId),
      this.providerConfigRepo.deleteByWorkspaceId(workspaceId),
      this.memorySchemaRepo.deleteByWorkspaceId(workspaceId),
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
