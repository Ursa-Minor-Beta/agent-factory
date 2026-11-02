import mongoose, { Schema, Document } from 'mongoose';
import { NODE_TYPES, type WorkflowNode, type EditorData, type AgentReference } from '../../../../domain/entities/Agent.js';

export interface AgentDocument extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  name: string;
  description: string;
  nodes: WorkflowNode[];
  editorData?: EditorData;
  workspaceId?: mongoose.Types.ObjectId;
  references?: AgentReference[];
  systemName?: string;
  defaultName?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const nodeSchema = new Schema(
  {
    id: { type: String, required: true },
    type: {
      type: String,
      required: true,
      enum: NODE_TYPES,
    },
    data: { type: Schema.Types.Mixed, default: {} },
    runAfter: { type: [String], default: undefined },
  },
  { _id: false }
);

export const referenceSchema = new Schema(
  {
    kind: { type: String, required: true, enum: ['agent-node', 'agent-tool', 'builtin-tool'] },
    nodeId: { type: String, required: true },
    targetAgentId: { type: String },
    toolName: { type: String },
    dynamic: { type: Boolean },
  },
  { _id: false }
);

export const agentSchemaDefinition = {
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
  editorData: {
    type: Schema.Types.Mixed,
  },
  workspaceId: {
    type: Schema.Types.ObjectId,
    ref: 'Workspace',
  },
  references: {
    type: [referenceSchema],
    default: undefined,
  },
  systemName: {
    type: String,
  },
  defaultName: {
    type: String,
  },
};

const agentSchema = new Schema<AgentDocument>(
  agentSchemaDefinition,
  {
    timestamps: true,
  }
);

agentSchema.index({ userId: 1 });
agentSchema.index({ systemName: 1 }, { sparse: true });
agentSchema.index({ defaultName: 1 }, { sparse: true });
agentSchema.index({ workspaceId: 1 }, { sparse: true });
agentSchema.index({ userId: 1, workspaceId: 1 });
agentSchema.index({ 'references.targetAgentId': 1 }, { sparse: true });

export const AgentModel = mongoose.model<AgentDocument>('Agent', agentSchema);
