import mongoose, { Schema, Document } from 'mongoose';
import type { ApiKeyPermission } from '../../../../domain/entities/ApiKey.js';

export interface ApiKeyDocument extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  keyHash: string;
  keyPrefix: string;
  name: string;
  permissions: ApiKeyPermission[];
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
}

const apiKeySchema = new Schema<ApiKeyDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    keyHash: {
      type: String,
      required: true,
      unique: true,
    },
    keyPrefix: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    permissions: {
      type: [String],
      required: true,
      default: ['agents:read', 'agents:run'],
    },
    lastUsedAt: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// Indexes defined inline: userId (index: true), keyHash (unique: true)

export const ApiKeyModel = mongoose.model<ApiKeyDocument>('ApiKey', apiKeySchema);
