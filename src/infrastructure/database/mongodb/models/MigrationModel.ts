import mongoose, { Schema, Document } from 'mongoose';

export interface MigrationDocument extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  executedAt: Date;
}

const migrationSchema = new Schema<MigrationDocument>({
  name: {
    type: String,
    required: true,
    unique: true,
  },
  executedAt: {
    type: Date,
    default: Date.now,
  },
});

export const MigrationModel = mongoose.model<MigrationDocument>(
  'Migration',
  migrationSchema
);
