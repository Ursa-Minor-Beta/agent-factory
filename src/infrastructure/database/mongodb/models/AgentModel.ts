import mongoose, { Schema, Document } from 'mongoose';
import { NODE_TYPES, type WorkflowNode } from '../../../../domain/entities/Agent.js';

export interface AgentDocument extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  name: string;
  description: string;
  nodes: WorkflowNode[];
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const nodeSchema = new Schema(
  {
    id: { type: String, required: true },
    type: {
      type: String,
      required: true,
      enum: NODE_TYPES,
    },
    data: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false }
);

const agentSchema = new Schema<AgentDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: '',
    },
    nodes: {
      type: [nodeSchema],
      default: [],
    },
    isSystem: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

agentSchema.index({ userId: 1 });

export const AgentModel = mongoose.model<AgentDocument>('Agent', agentSchema);
