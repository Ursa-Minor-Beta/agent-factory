export interface UserSecret {
  id: string;
  userId: string;
  name: string;
  value: string;
  description?: string;
  /** Workspace scope - null/undefined means global (available to all agents) */
  workspaceId?: string;
  /** Workspace name (populated via lookup) */
  workspaceName?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserSecretDTO {
  userId: string;
  name: string;
  value: string;
  description?: string;
  workspaceId?: string;
}

export interface UpdateUserSecretDTO {
  name?: string;
  value?: string;
  description?: string;
  workspaceId?: string | null;
}
