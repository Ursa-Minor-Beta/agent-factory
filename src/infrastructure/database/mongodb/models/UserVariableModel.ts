import mongoose, { Schema, Document } from 'mongoose';

export interface UserVariableDocument extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  name: string;
  value: string;
  description?: string;
  workspaceId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const userVariableSchema = new Schema<UserVariableDocument>(
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
      match: /^[a-zA-Z_][a-zA-Z0-9_]*$/,
    },
    value: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      trim: true,
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

// Unique constraint: name per user per workspace (null workspace = global)
userVariableSchema.index({ userId: 1, workspaceId: 1, name: 1 }, { unique: true });
userVariableSchema.index({ userId: 1, workspaceId: 1 });

export const UserVariableModel = mongoose.model<UserVariableDocument>(
  'UserVariable',
  userVariableSchema
);
