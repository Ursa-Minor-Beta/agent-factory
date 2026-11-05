export interface UserVariable {
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

export interface CreateUserVariableDTO {
  userId: string;
  name: string;
  value: string;
  description?: string;
  workspaceId?: string;
}

export interface UpdateUserVariableDTO {
  name?: string;
  value?: string;
  description?: string;
  workspaceId?: string | null;
}
