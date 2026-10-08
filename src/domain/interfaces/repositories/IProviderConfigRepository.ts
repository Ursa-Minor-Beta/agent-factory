import type {
  ProviderConfig,
  CreateProviderConfigDTO,
  UpdateProviderConfigDTO,
  ProviderType,
} from '../../entities/ProviderConfig.js';

export interface ProviderConfigQueryOptions {
  /** Filter by provider type (e.g., "github", "openai") */
  provider?: ProviderType;
  /** Filter by workspace: undefined = all, null = global only, "<id>" = workspace only */
  workspaceId?: string | null;
}

export interface IProviderConfigRepository {
  findById(id: string): Promise<ProviderConfig | null>;
  findByUserId(userId: string, options?: ProviderConfigQueryOptions): Promise<ProviderConfig[]>;
  /**
   * Find default provider config within scope (workspace takes precedence over global)
   * @param workspaceIds - Array of workspace IDs to search, null = global
   */
  findDefault(userId: string, provider: ProviderType, workspaceIds?: (string | null)[]): Promise<ProviderConfig | null>;
  create(data: CreateProviderConfigDTO): Promise<ProviderConfig>;
  update(id: string, data: UpdateProviderConfigDTO): Promise<ProviderConfig | null>;
  setDefault(id: string, userId: string, provider: ProviderType): Promise<ProviderConfig | null>;
  delete(id: string): Promise<boolean>;
  /**
   * Delete all provider configs scoped to a workspace
   * @returns Number of deleted configs
   */
  deleteByWorkspaceId(workspaceId: string): Promise<number>;
  /**
   * Find all provider configs available to an agent (global + workspace-scoped)
   * Workspace-scoped configs take precedence over global on provider conflict
   */
  findAvailableForAgent(userId: string, workspaceId?: string): Promise<ProviderConfig[]>;
  /**
   * Count provider configs for a user within a workspace scope
   */
  count(userId: string, workspaceId?: string | null): Promise<number>;
}
