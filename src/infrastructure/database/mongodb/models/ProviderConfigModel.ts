import mongoose, { Schema, Document } from 'mongoose';
import type { ProviderType } from '../../../../domain/entities/ProviderConfig.js';

export interface ProviderConfigDocument extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  provider: ProviderType;
  name: string;
  isDefault: boolean;
  config: {
    apiKey?: string;
    baseUrl?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const providerConfigSchema = new Schema<ProviderConfigDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    provider: {
      type: String,
      required: true,
      enum: ['openai', 'anthropic', 'ollama'],
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    config: {
      apiKey: { type: String },
      baseUrl: { type: String },
    },
  },
  {
    timestamps: true,
  }
);

providerConfigSchema.index({ userId: 1, provider: 1 });
providerConfigSchema.index({ userId: 1, isDefault: 1 });

export const ProviderConfigModel = mongoose.model<ProviderConfigDocument>(
  'ProviderConfig',
  providerConfigSchema
);
