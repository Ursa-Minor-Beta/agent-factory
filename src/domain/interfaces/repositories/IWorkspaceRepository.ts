import type {
  Workspace,
  CreateWorkspaceDTO,
  UpdateWorkspaceDTO,
  WorkspaceQueryOptions,
  WorkspaceListResult,
} from '../../entities/Workspace.js';

export interface IWorkspaceRepository {
  findById(id: string): Promise<Workspace | null>;
  findByUserId(userId: string, options?: WorkspaceQueryOptions): Promise<WorkspaceListResult>;
  findByDefaultName(defaultName: string): Promise<Workspace | null>;
  create(data: CreateWorkspaceDTO): Promise<Workspace>;
  update(id: string, data: UpdateWorkspaceDTO): Promise<Workspace | null>;
  delete(id: string): Promise<boolean>;
  count(): Promise<number>;
  countAgentsInWorkspace(workspaceId: string): Promise<number>;
}
