import mongoose, { Schema } from 'mongoose';
import type { AgentDocument } from './AgentModel.js';
import { agentSchemaDefinition } from './AgentModel.js';

export interface AgentVersionDocument extends Omit<AgentDocument, '_id'> {
  _id: mongoose.Types.ObjectId;
  agentIdRef: mongoose.Types.ObjectId;
}

const agentVersionSchema = new Schema<AgentVersionDocument>(
  {
    agentIdRef: {
      type: Schema.Types.ObjectId,
      ref: 'Agent',
      required: true,
    },
    ...agentSchemaDefinition,
  },
  {
    timestamps: true,
    collection: 'agents.snapshots',
  }
);

agentVersionSchema.index({ agentIdRef: 1, createdAt: -1 });
agentVersionSchema.index({ userId: 1 });

export const AgentVersionModel = mongoose.model<AgentVersionDocument>('AgentVersion', agentVersionSchema);
