import mongoose, { Schema, Document } from 'mongoose';

export interface AuthSessionDocument extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  userAgent: string | null;
  lastUsedAt: Date;
  expiresAt: Date;
  createdAt: Date;
}

const authSessionSchema = new Schema<AuthSessionDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    userAgent: {
      type: String,
      default: null,
    },
    lastUsedAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// MongoDB removes expired sessions automatically
authSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const AuthSessionModel = mongoose.model<AuthSessionDocument>('AuthSession', authSessionSchema);
