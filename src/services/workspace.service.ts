import type { IWorkspaceRepository } from '../domain/interfaces/repositories/IWorkspaceRepository.js';
import type { IAgentRepository } from '../domain/interfaces/repositories/IAgentRepository.js';
import type { IUserSecretRepository } from '../domain/interfaces/repositories/IUserSecretRepository.js';
import type { IUserVariableRepository } from '../domain/interfaces/repositories/IUserVariableRepository.js';
import type { IProviderConfigRepository } from '../domain/interfaces/repositories/IProviderConfigRepository.js';
import type { IMemorySchemaRepository } from '../domain/interfaces/repositories/IMemorySchemaRepository.js';
import type { IMemoryStoreRepository } from '../domain/interfaces/repositories/IMemoryStoreRepository.js';
import type { IAgentScheduleRepository } from '../domain/interfaces/repositories/IAgentScheduleRepository.js';
import type {
  Workspace,
  CreateWorkspaceDTO,
  UpdateWorkspaceDTO,
  WorkspaceQueryOptions,
  WorkspaceListResult,
} from '../domain/entities/Workspace.js';
import { NotFoundError, ForbiddenError } from '../utils/errors.js';
import { buildWorkspaceGraph, type AgentGraph } from '../domain/services/agent-graph.service.js';

export interface WorkspaceServiceDependencies {
  workspaceRepo: IWorkspaceRepository;
  agentRepo: IAgentRepository;
  userSecretRepo: IUserSecretRepository;
  userVariableRepo: IUserVariableRepository;
  providerConfigRepo: IProviderConfigRepository;
  memorySchemaRepo: IMemorySchemaRepository;
  memoryStoreRepo: IMemoryStoreRepository;
  agentScheduleRepo: IAgentScheduleRepository;
}

export class WorkspaceService {
  private workspaceRepo: IWorkspaceRepository;
  private agentRepo: IAgentRepository;
  private userSecretRepo: IUserSecretRepository;
  private userVariableRepo: IUserVariableRepository;
  private providerConfigRepo: IProviderConfigRepository;
  private memorySchemaRepo: IMemorySchemaRepository;
  private memoryStoreRepo: IMemoryStoreRepository;
  private agentScheduleRepo: IAgentScheduleRepository;

  constructor(deps: WorkspaceServiceDependencies) {
    this.workspaceRepo = deps.workspaceRepo;
    this.agentRepo = deps.agentRepo;
    this.userSecretRepo = deps.userSecretRepo;
    this.userVariableRepo = deps.userVariableRepo;
    this.providerConfigRepo = deps.providerConfigRepo;
    this.memorySchemaRepo = deps.memorySchemaRepo;
    this.memoryStoreRepo = deps.memoryStoreRepo;
    this.agentScheduleRepo = deps.agentScheduleRepo;
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

  async getAgentGraph(userId: string, workspaceId: string, includeCallers = false): Promise<AgentGraph> {
    await this.getById(userId, workspaceId);

    return buildWorkspaceGraph(workspaceId, {
      findWorkspaceAgents: () => this.agentRepo.findGraphItems({ userId, workspaceId }),
      findAgentsByIds: (ids) => this.agentRepo.findGraphItems({ userId, ids }),
      findCallers: includeCallers
        ? (targetIds) => this.agentRepo.findGraphItems({ userId, referencedAgentIds: targetIds })
        : undefined,
    });
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
      this.agentRepo.delete({ workspaceId }),
      ...schemas.map((schema) => this.memoryStoreRepo.deleteBySchemaId(schema.id)),
      this.userSecretRepo.delete({ workspaceId }),
      this.userVariableRepo.delete({ workspaceId }),
      this.providerConfigRepo.delete({ workspaceId }),
      this.memorySchemaRepo.delete({ workspaceId }),
      this.agentScheduleRepo.delete({ workspaceId }),
    ]);

    // Delete the workspace
    await this.workspaceRepo.delete({ id: workspaceId });
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

  async getByIdWithCounts(
    userId: string,
    workspaceId: string
  ): Promise<Workspace & {
    agentCount: number;
    secretCount: number;
    variableCount: number;
    providerCount: number;
    collectionCount: number;
    scheduleCount: number;
  }> {
    const workspace = await this.workspaceRepo.findById(workspaceId);
    if (!workspace) {
      throw new NotFoundError('Workspace');
    }
    if (workspace.userId !== userId) {
      throw new ForbiddenError('Access denied');
    }

    const [agentCount, secretCount, variableCount, providerCount, collectionCount, scheduleCount] = await Promise.all([
      this.workspaceRepo.countAgentsInWorkspace(workspaceId),
      this.userSecretRepo.count(userId, workspaceId),
      this.userVariableRepo.count(userId, workspaceId),
      this.providerConfigRepo.count(userId, workspaceId),
      this.memorySchemaRepo.count(userId, workspaceId),
      this.agentScheduleRepo.count(userId, workspaceId),
    ]);

    return {
      ...workspace,
      agentCount,
      secretCount,
      variableCount,
      providerCount,
      collectionCount,
      scheduleCount,
    };
  }
}
