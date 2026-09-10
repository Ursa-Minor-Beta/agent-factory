import mongoose, { Schema, Document } from 'mongoose';

export interface UserSecretDocument extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  name: string;
  encryptedValue: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

const userSecretSchema = new Schema<UserSecretDocument>(
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
    encryptedValue: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Unique constraint: name per user
userSecretSchema.index({ userId: 1, name: 1 }, { unique: true });

export const UserSecretModel = mongoose.model<UserSecretDocument>(
  'UserSecret',
  userSecretSchema
);
