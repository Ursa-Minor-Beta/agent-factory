import type {
  UserVariable,
  CreateUserVariableDTO,
  UpdateUserVariableDTO,
} from '../../entities/UserVariable.js';

export interface UserVariableQueryOptions {
  /** Filter by workspace: undefined = all, null = global only, "<id>" = workspace only */
  workspaceId?: string | null;
}

export interface IUserVariableRepository {
  findById(id: string): Promise<UserVariable | null>;
  findByUserId(userId: string, options?: UserVariableQueryOptions): Promise<UserVariable[]>;
  /**
   * Find variable by name within scope (workspace takes precedence over global)
   * @param workspaceIds - Array of workspace IDs to search, null = global
   */
  findByName(userId: string, name: string, workspaceIds?: (string | null)[]): Promise<UserVariable | null>;
  create(data: CreateUserVariableDTO): Promise<UserVariable>;
  update(id: string, data: UpdateUserVariableDTO): Promise<UserVariable | null>;
  /**
   * Delete variables by id, workspaceId, or userId
   * @returns Number of deleted variables
   */
  delete(options: { id?: string; workspaceId?: string; userId?: string }): Promise<number>;
  /**
   * Find all variables available to an agent (global + workspace-scoped)
   * Workspace-scoped variables take precedence over global on name conflict
   */
  findAvailableForAgent(userId: string, workspaceId?: string): Promise<UserVariable[]>;
  /**
   * Count variables for a user within a workspace scope
   */
  count(userId: string, workspaceId?: string | null): Promise<number>;
}
