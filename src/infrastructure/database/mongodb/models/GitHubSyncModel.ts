import mongoose, { Schema, Document } from 'mongoose';
import { GITHUB_SYNC_ENTITY, GITHUB_SYNC_STATUS } from '../../../../domain/entities/GitHubSync.js';

export interface GitHubSyncDocument extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  entityType: string;
  entityId: mongoose.Types.ObjectId;
  providerName: string;
  publicRepo: boolean;
  repository: string;
  branch: string;
  path: string;
  status: string;
  lastCommitSha: string | null;
  lastSyncedAt: Date | null;
  agentIdMap: Record<string, string>;
  createdAt: Date;
  updatedAt: Date;
}

const gitHubSyncSchema = new Schema<GitHubSyncDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    entityType: {
      type: String,
      enum: Object.values(GITHUB_SYNC_ENTITY),
      required: true,
    },
    entityId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    providerName: {
      type: String,
      required: true,
    },
    publicRepo: {
      type: Boolean,
      default: false,
    },
    repository: {
      type: String,
      required: true,
    },
    branch: {
      type: String,
      required: true,
      default: 'main',
    },
    path: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(GITHUB_SYNC_STATUS),
      default: GITHUB_SYNC_STATUS.LOCAL_AHEAD,
    },
    lastCommitSha: {
      type: String,
      default: null,
    },
    lastSyncedAt: {
      type: Date,
      default: null,
    },
    agentIdMap: {
      type: Map,
      of: String,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// One sync per entity
gitHubSyncSchema.index({ userId: 1, entityType: 1, entityId: 1 }, { unique: true });

// Query by user
gitHubSyncSchema.index({ userId: 1 });

export const GitHubSyncModel = mongoose.model<GitHubSyncDocument>('GitHubSync', gitHubSyncSchema);
