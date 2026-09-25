import mongoose, { Schema, Document } from 'mongoose';
import { NODE_TYPES, type WorkflowNode } from '../../../../domain/entities/Agent.js';

export interface AgentDocument extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  name: string;
  description: string;
  nodes: WorkflowNode[];
  systemName?: string;
  defaultName?: string;
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
    systemName: {
      type: String,
    },
    defaultName: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

agentSchema.index({ userId: 1 });
agentSchema.index({ systemName: 1 }, { sparse: true });
agentSchema.index({ defaultName: 1 }, { sparse: true });

export const AgentModel = mongoose.model<AgentDocument>('Agent', agentSchema);
