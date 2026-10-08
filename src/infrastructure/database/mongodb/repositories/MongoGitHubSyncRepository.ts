import { GitHubSyncModel, type GitHubSyncDocument } from '../models/GitHubSyncModel.js';
import type { IGitHubSyncRepository } from '../../../../domain/interfaces/repositories/IGitHubSyncRepository.js';
import type {
  GitHubSync,
  GitHubSyncEntity,
  GitHubSyncStatus,
  CreateGitHubSyncDTO,
  UpdateGitHubSyncDTO,
} from '../../../../domain/entities/GitHubSync.js';
import { GITHUB_SYNC_STATUS } from '../../../../domain/entities/GitHubSync.js';

export class MongoGitHubSyncRepository implements IGitHubSyncRepository {
  private toEntity(doc: GitHubSyncDocument): GitHubSync {
    // Convert Mongoose Map to plain object
    const agentIdMap: Record<string, string> = {};
    if (doc.agentIdMap) {
      const map = doc.agentIdMap as unknown as Map<string, string>;
      if (map.forEach) {
        map.forEach((value, key) => {
          agentIdMap[key] = value;
        });
      }
    }

    return {
      id: doc._id.toString(),
      userId: doc.userId.toString(),
      entityType: doc.entityType as GitHubSyncEntity,
      entityId: doc.entityId.toString(),
      providerName: doc.providerName,
      publicRepo: doc.publicRepo,
      repository: doc.repository,
      branch: doc.branch,
      path: doc.path,
      status: doc.status as GitHubSyncStatus,
      lastCommitSha: doc.lastCommitSha,
      lastSyncedAt: doc.lastSyncedAt,
      agentIdMap,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  async findById(id: string): Promise<GitHubSync | null> {
    const doc = await GitHubSyncModel.findById(id);
    return doc ? this.toEntity(doc) : null;
  }

  async findByEntity(
    userId: string,
    entityType: GitHubSyncEntity,
    entityId: string
  ): Promise<GitHubSync | null> {
    const doc = await GitHubSyncModel.findOne({ userId, entityType, entityId });
    return doc ? this.toEntity(doc) : null;
  }

  async findByUserId(userId: string): Promise<GitHubSync[]> {
    const docs = await GitHubSyncModel.find({ userId });
    return docs.map((doc) => this.toEntity(doc));
  }

  async create(data: CreateGitHubSyncDTO): Promise<GitHubSync> {
    const doc = await GitHubSyncModel.create({
      userId: data.userId,
      entityType: data.entityType,
      entityId: data.entityId,
      providerName: data.providerName ?? 'default',
      publicRepo: data.publicRepo ?? false,
      repository: data.repository,
      branch: data.branch ?? 'main',
      path: data.path,
      status: GITHUB_SYNC_STATUS.LOCAL_AHEAD,
      lastCommitSha: null,
      lastSyncedAt: null,
      agentIdMap: {},
    });
    return this.toEntity(doc);
  }

  async update(id: string, data: UpdateGitHubSyncDTO): Promise<GitHubSync | null> {
    const doc = await GitHubSyncModel.findByIdAndUpdate(id, { $set: data }, { new: true });
    return doc ? this.toEntity(doc) : null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await GitHubSyncModel.findByIdAndDelete(id);
    return result !== null;
  }
}
