import mongoose, { Schema, Document } from 'mongoose';
import type { MemoryFieldType } from '../../../../domain/entities/Memory.js';

export interface MemorySchemaFieldDocument {
  name: string;
  type: MemoryFieldType;
  required?: boolean;
  index?: boolean;
  description?: string;
  default?: unknown;
  items?: MemoryFieldType;
}

export interface MemorySchemaDocument extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  name: string;
  description: string | null;
  fields: MemorySchemaFieldDocument[];
  workspaceId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const memorySchemaFieldSchema = new Schema<MemorySchemaFieldDocument>(
  {
    name: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ['string', 'number', 'boolean', 'date', 'array', 'object'],
      required: true,
    },
    required: {
      type: Boolean,
      default: false,
    },
    index: {
      type: Boolean,
      default: false,
    },
    description: {
      type: String,
      default: null,
    },
    default: {
      type: Schema.Types.Mixed,
      default: null,
    },
    items: {
      type: String,
      enum: ['string', 'number', 'boolean', 'date', 'array', 'object'],
      default: null,
    },
  },
  { _id: false }
);

const memorySchemaSchema = new Schema<MemorySchemaDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      default: null,
    },
    fields: {
      type: [memorySchemaFieldSchema],
      default: [],
    },
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: 'Workspace',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Unique constraint on userId + workspaceId + name (null workspace = global)
memorySchemaSchema.index({ userId: 1, workspaceId: 1, name: 1 }, { unique: true });
memorySchemaSchema.index({ userId: 1, workspaceId: 1 });
memorySchemaSchema.index({ userId: 1, createdAt: -1 });

export const MemorySchemaModel = mongoose.model<MemorySchemaDocument>(
  'MemorySchema',
  memorySchemaSchema
);
