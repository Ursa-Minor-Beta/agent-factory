import type {
  UserSecret,
  CreateUserSecretDTO,
  UpdateUserSecretDTO,
} from '../../entities/UserSecret.js';

export interface UserSecretQueryOptions {
  /** Filter by workspace: undefined = all, null = global only, "<id>" = workspace only */
  workspaceId?: string | null;
}

export interface IUserSecretRepository {
  findById(id: string): Promise<UserSecret | null>;
  findByUserId(userId: string, options?: UserSecretQueryOptions): Promise<UserSecret[]>;
  /**
   * Find secret by name within scope (workspace takes precedence over global)
   * @param workspaceIds - Array of workspace IDs to search, null = global
   */
  findByName(userId: string, name: string, workspaceIds?: (string | null)[]): Promise<UserSecret | null>;
  create(data: CreateUserSecretDTO): Promise<UserSecret>;
  update(id: string, data: UpdateUserSecretDTO): Promise<UserSecret | null>;
  delete(id: string): Promise<boolean>;
  /**
   * Delete all secrets scoped to a workspace
   * @returns Number of deleted secrets
   */
  deleteByWorkspaceId(workspaceId: string): Promise<number>;
  /**
   * Find all secrets available to an agent (global + workspace-scoped)
   * Workspace-scoped secrets take precedence over global on name conflict
   */
  findAvailableForAgent(userId: string, workspaceId?: string): Promise<UserSecret[]>;
  /**
   * Count secrets for a user within a workspace scope
   */
  count(userId: string, workspaceId?: string | null): Promise<number>;
}
