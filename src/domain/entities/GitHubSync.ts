export const GITHUB_SYNC_ENTITY = {
  AGENT: 'agent',
  COLLECTION: 'collection',
} as const;

export type GitHubSyncEntity = (typeof GITHUB_SYNC_ENTITY)[keyof typeof GITHUB_SYNC_ENTITY];

export const GITHUB_SYNC_STATUS = {
  SYNCED: 'synced',
  LOCAL_AHEAD: 'local_ahead',
  REMOTE_AHEAD: 'remote_ahead',
  CONFLICT: 'conflict',
} as const;

export type GitHubSyncStatus = (typeof GITHUB_SYNC_STATUS)[keyof typeof GITHUB_SYNC_STATUS];

export interface GitHubSync {
  id: string;
  userId: string;

  /** What to sync */
  entityType: GitHubSyncEntity;
  entityId: string;

  /** GitHub provider name (for multi-account support) */
  providerName: string;

  /** Public repo - no auth needed (read-only) */
  publicRepo: boolean;

  /** GitHub location */
  repository: string;
  branch: string;
  path: string;

  /** Sync state */
  status: GitHubSyncStatus;
  lastCommitSha: string | null;
  lastSyncedAt: Date | null;

  /** Maps export refId → local agentId (for main + all dependencies) */
  agentIdMap: Record<string, string>;

  createdAt: Date;
  updatedAt: Date;
}

export interface CreateGitHubSyncDTO {
  userId: string;
  entityType: GitHubSyncEntity;
  entityId: string;
  /** GitHub provider name (uses default if not specified) */
  providerName?: string;
  /** Public repo - no auth needed (read-only) */
  publicRepo?: boolean;
  repository: string;
  branch?: string;
  path: string;
}

export interface UpdateGitHubSyncDTO {
  providerName?: string;
  publicRepo?: boolean;
  repository?: string;
  branch?: string;
  path?: string;
  status?: GitHubSyncStatus;
  lastCommitSha?: string | null;
  lastSyncedAt?: Date | null;
  agentIdMap?: Record<string, string>;
}
