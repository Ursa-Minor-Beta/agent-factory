import mongoose, { Schema, Document } from 'mongoose';
import type {
  ScheduleTrigger,
  ScheduleSessionMode,
  ScheduleOverlapPolicy,
  ScheduleLastStatus,
} from '../../../../domain/entities/AgentSchedule.js';
import { SCHEDULE_TRIGGER_TYPES } from '../../../../domain/entities/AgentSchedule.js';

export interface AgentScheduleDocument extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  agentId: mongoose.Types.ObjectId;
  workspaceId?: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  enabled: boolean;
  trigger: ScheduleTrigger;
  timezone: string;
  input: Record<string, unknown>;
  sessionMode: ScheduleSessionMode;
  sessionId?: string;
  overlapPolicy: ScheduleOverlapPolicy;
  stopAfterFailures: number;
  nextRunAt?: Date;
  lastRunAt?: Date;
  lastRunId?: string;
  lastStatus?: ScheduleLastStatus;
  lastError?: string;
  runCount: number;
  consecutiveFailures: number;
  createdAt: Date;
  updatedAt: Date;
}

const triggerSchema = new Schema(
  {
    type: { type: String, enum: SCHEDULE_TRIGGER_TYPES, required: true },
    // cron
    expression: { type: String },
    startAt: { type: Date },
    // once
    at: { type: Date },
    // interval
    everyMs: { type: Number },
    anchorAt: { type: Date },
    // cron + interval
    endAt: { type: Date },
    maxRuns: { type: Number },
  },
  { _id: false }
);

const agentScheduleSchema = new Schema<AgentScheduleDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    agentId: { type: Schema.Types.ObjectId, ref: 'Agent', required: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', default: null },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    enabled: { type: Boolean, default: true },
    trigger: { type: triggerSchema, required: true },
    timezone: { type: String, default: 'UTC' },
    input: { type: Schema.Types.Mixed, default: {} },
    sessionMode: { type: String, enum: ['session', 'incognito'], default: 'incognito' },
    sessionId: { type: String },
    overlapPolicy: { type: String, enum: ['skip', 'allow'], default: 'skip' },
    stopAfterFailures: { type: Number, default: 0 },
    nextRunAt: { type: Date },
    lastRunAt: { type: Date },
    lastRunId: { type: String },
    lastStatus: { type: String, enum: ['completed', 'failed', 'cancelled', 'skipped'] },
    lastError: { type: String },
    runCount: { type: Number, default: 0 },
    consecutiveFailures: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    minimize: false,
  }
);

agentScheduleSchema.index({ enabled: 1, nextRunAt: 1 });
agentScheduleSchema.index({ userId: 1, workspaceId: 1 });
agentScheduleSchema.index({ agentId: 1 });

export const AgentScheduleModel = mongoose.model<AgentScheduleDocument>(
  'AgentSchedule',
  agentScheduleSchema
);
