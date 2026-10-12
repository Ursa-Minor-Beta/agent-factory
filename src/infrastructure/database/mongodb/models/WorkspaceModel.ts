import mongoose, { Schema, Document } from 'mongoose';

export interface WorkspaceDocument extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  defaultName?: string;
  createdAt: Date;
  updatedAt: Date;
}

const workspaceSchema = new Schema<WorkspaceDocument>(
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
      trim: true,
    },
    defaultName: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index for querying user's workspaces
workspaceSchema.index({ userId: 1 });

// Index for name searches within user's workspaces
workspaceSchema.index({ userId: 1, name: 1 });

// Index for finding workspaces by defaultName (sparse index)
workspaceSchema.index({ defaultName: 1 }, { sparse: true });

export const WorkspaceModel = mongoose.model<WorkspaceDocument>('Workspace', workspaceSchema);
