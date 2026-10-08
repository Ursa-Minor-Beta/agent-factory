import type {
  GitHubSync,
  GitHubSyncEntity,
  CreateGitHubSyncDTO,
  UpdateGitHubSyncDTO,
} from '../../entities/GitHubSync.js';

export interface IGitHubSyncRepository {
  findById(id: string): Promise<GitHubSync | null>;
  findByEntity(userId: string, entityType: GitHubSyncEntity, entityId: string): Promise<GitHubSync | null>;
  findByUserId(userId: string): Promise<GitHubSync[]>;
  create(data: CreateGitHubSyncDTO): Promise<GitHubSync>;
  update(id: string, data: UpdateGitHubSyncDTO): Promise<GitHubSync | null>;
  delete(id: string): Promise<boolean>;
}
