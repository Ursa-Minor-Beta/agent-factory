import mongoose, { Schema, Document } from 'mongoose';
import {
  NODE_TYPES,
  type WorkflowNode,
  type WorkflowEdge,
  type WorkflowVariable,
} from '../../../../domain/entities/Agent.js';

export interface AgentDocument extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  name: string;
  description: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  variables: WorkflowVariable[];
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

const edgeSchema = new Schema(
  {
    id: { type: String, required: true },
    source: { type: String, required: true },
    sourceHandle: { type: String, required: true },
    target: { type: String, required: true },
    targetHandle: { type: String, required: true },
  },
  { _id: false }
);

const variableSchema = new Schema(
  {
    name: { type: String, required: true },
    type: {
      type: String,
      required: true,
      enum: ['string', 'number', 'boolean'],
    },
    defaultValue: { type: Schema.Types.Mixed },
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
    edges: {
      type: [edgeSchema],
      default: [],
    },
    variables: {
      type: [variableSchema],
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
