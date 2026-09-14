import mongoose, { Schema, Document } from 'mongoose';

export interface FileDocument extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  name: string;
  mimeType: string;
  data: string;
  createdAt: Date;
}

const fileSchema = new Schema<FileDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    mimeType: {
      type: String,
      required: true,
    },
    data: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

fileSchema.index({ userId: 1, createdAt: -1 });

export const FileModel = mongoose.model<FileDocument>('File', fileSchema);
