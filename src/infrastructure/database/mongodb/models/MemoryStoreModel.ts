import mongoose, { Schema, Document } from 'mongoose';

export interface MemoryRecordDocument extends Document {
  _id: mongoose.Types.ObjectId;
  schemaId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  /** User-defined fields stored at root level */
  [key: string]: unknown;
}

const memoryRecordSchema = new Schema<MemoryRecordDocument>(
  {
    schemaId: {
      type: Schema.Types.ObjectId,
      ref: 'MemorySchema',
      required: true,
    },
    // User-defined schema fields will be stored at root level
    // strict: false allows dynamic fields
  },
  {
    timestamps: true,
    strict: false, // Allow dynamic user-defined fields at root level
  }
);

// Primary index for schema-based queries
memoryRecordSchema.index({ schemaId: 1, createdAt: -1 });

export const MemoryRecordModel = mongoose.model<MemoryRecordDocument>(
  'MemoryRecord',
  memoryRecordSchema
);
