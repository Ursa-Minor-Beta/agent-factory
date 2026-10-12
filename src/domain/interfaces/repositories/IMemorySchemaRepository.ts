import type {
  MemorySchema,
  CreateMemorySchemaDTO,
  UpdateMemorySchemaDTO,
} from '../../entities/Memory.js';

export interface MemorySchemaQueryOptions {
  /** Filter by workspace: undefined = all, null = global only, "<id>" = workspace only */
  workspaceId?: string | null;
  limit?: number;
  offset?: number;
}

export interface IMemorySchemaRepository {
  /**
   * Find a schema by its ID
   */
  findById(id: string): Promise<MemorySchema | null>;

  /**
   * Find a schema by user ID and name within scope
   * @param workspaceIds - Array of workspace IDs to search, null = global
   */
  findByName(userId: string, name: string, workspaceIds?: (string | null)[]): Promise<MemorySchema | null>;

  /**
   * Find all schemas for a user
   */
  findByUserId(
    userId: string,
    options?: MemorySchemaQueryOptions
  ): Promise<MemorySchema[]>;

  /**
   * Create a new memory schema
   */
  create(data: CreateMemorySchemaDTO): Promise<MemorySchema>;

  /**
   * Update an existing schema
   */
  update(id: string, data: UpdateMemorySchemaDTO): Promise<MemorySchema | null>;

  /**
   * Delete a schema (and optionally all its records)
   */
  delete(id: string): Promise<boolean>;

  /**
   * Delete all schemas scoped to a workspace
   * @returns Number of deleted schemas
   */
  deleteByWorkspaceId(workspaceId: string): Promise<number>;

  /**
   * Check if a schema name is already used by user within workspace scope
   */
  nameExists(userId: string, name: string, workspaceId?: string | null, excludeId?: string): Promise<boolean>;

  /**
   * Count schemas for a user
   */
  count(userId: string, workspaceId?: string | null): Promise<number>;

  /**
   * Find all schemas available to an agent (global + workspace-scoped)
   * Workspace-scoped schemas take precedence over global on name conflict
   */
  findAvailableForAgent(userId: string, workspaceId?: string): Promise<MemorySchema[]>;
}
