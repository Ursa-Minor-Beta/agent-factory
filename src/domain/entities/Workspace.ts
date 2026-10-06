/**
 * Workspace Entity
 * Represents a workspace for organizing agents
 */

export interface Workspace {
  id: string;
  userId: string;
  name: string;
  description?: string;
  defaultName?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * DTO for creating a new workspace
 */
export interface CreateWorkspaceDTO {
  userId: string;
  name: string;
  description?: string;
  defaultName?: string;
}

/**
 * DTO for updating an existing workspace
 */
export interface UpdateWorkspaceDTO {
  name?: string;
  description?: string;
}

/**
 * Query options for listing workspaces
 */
export interface WorkspaceQueryOptions {
  name?: string; // Filter by name (regex)
  sortBy?: 'name' | 'createdAt' | 'updatedAt';
  sortOrder?: 'asc' | 'desc';
  skip?: number;
  limit?: number;
}

/**
 * Result of workspace list query
 */
export interface WorkspaceListResult {
  workspaces: Workspace[];
  total: number;
  skip: number;
  limit: number;
}
