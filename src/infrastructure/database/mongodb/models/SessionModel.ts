import mongoose, { Schema, Document } from 'mongoose';
import type { SessionStatus } from '../../../../domain/entities/Session.js';
import { AGENT_NOTES_MAX_LENGTH } from '../../../../domain/entities/Session.js';

export interface SessionDocument extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  agentId: mongoose.Types.ObjectId;
  title: string | null;
  status: SessionStatus;
  incognito: boolean;
  agentNotes: string;
  createdAt: Date;
  updatedAt: Date;
}

const sessionSchema = new Schema<SessionDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    agentId: {
      type: Schema.Types.ObjectId,
      ref: 'Agent',
      required: true,
    },
    title: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ['active', 'archived'],
      default: 'active',
    },
    incognito: {
      type: Boolean,
      default: false,
    },
    agentNotes: {
      type: String,
      default: '',
      maxlength: AGENT_NOTES_MAX_LENGTH,
    },
  },
  {
    timestamps: true,
  }
);

sessionSchema.index({ userId: 1, createdAt: -1 });
sessionSchema.index({ agentId: 1, createdAt: -1 });
sessionSchema.index({ userId: 1, status: 1 });

export const SessionModel = mongoose.model<SessionDocument>('Session', sessionSchema);
