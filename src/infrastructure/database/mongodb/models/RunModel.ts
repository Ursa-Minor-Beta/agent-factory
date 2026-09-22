import mongoose, { Schema, Document } from 'mongoose';
import type { RunStatus, NodeState, RunTrigger } from '../../../../domain/entities/Run.js';

export interface RunDocument extends Document {
  _id: mongoose.Types.ObjectId;
  agentId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  files?: string[];
  status: RunStatus;
  nodeStates: Map<string, NodeState>;
  error: string | null;
  startedAt: Date;
  completedAt: Date | null;
  // Parent-child relationship
  parentRunId?: mongoose.Types.ObjectId;
  triggeredBy?: RunTrigger;
}

const nodeStateSchema = new Schema(
  {
    status: {
      type: String,
      enum: ['pending', 'running', 'completed', 'failed', 'skipped'],
      default: 'pending',
    },
    input: { type: Schema.Types.Mixed },
    output: { type: Schema.Types.Mixed },
    state: { type: Schema.Types.Mixed },
    files: { type: [String], default: undefined },
    error: { type: String, default: null },
    errorDetails: { type: Schema.Types.Mixed },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { _id: false }
);

const runSchema = new Schema<RunDocument>(
  {
    agentId: {
      type: Schema.Types.ObjectId,
      ref: 'Agent',
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    input: {
      type: Schema.Types.Mixed,
      required: true,
    },
    output: {
      type: Schema.Types.Mixed,
      default: null,
    },
    files: {
      type: [String],
      default: undefined,
    },
    status: {
      type: String,
      enum: ['pending', 'running', 'completed', 'failed', 'cancelling', 'cancelled'],
      default: 'pending',
    },
    nodeStates: {
      type: Map,
      of: nodeStateSchema,
      default: new Map(),
    },
    error: {
      type: String,
      default: null,
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    // Parent-child relationship
    parentRunId: {
      type: Schema.Types.ObjectId,
      ref: 'Run',
      default: undefined,
      index: true,
    },
    triggeredBy: {
      // Use nested object with explicit type definitions
      // 'type' field renamed to avoid Mongoose keyword conflict
      triggerType: {
        type: String,
        enum: ['agent_node', 'tool_call'],
      },
      nodeId: { type: String },
      toolName: { type: String },
    },
  },
  {
    timestamps: false,
  }
);

runSchema.index({ agentId: 1, startedAt: -1 });
runSchema.index({ userId: 1, startedAt: -1 });
runSchema.index({ status: 1 });
runSchema.index({ parentRunId: 1, startedAt: -1 });

export const RunModel = mongoose.model<RunDocument>('Run', runSchema);
