import mongoose, { Schema, Document } from 'mongoose';
import { USER_ROLES, type UserRole } from '../../../../domain/entities/User.js';

export interface UserDocument extends Document {
  _id: mongoose.Types.ObjectId;
  email: string;
  passwordHash: string;
  name: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<UserDocument>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    role: {
      type: String,
      enum: USER_ROLES,
      default: 'user',
    },
  },
  {
    timestamps: true,
  }
);

// Index on email created by unique: true

export const UserModel = mongoose.model<UserDocument>('User', userSchema);
