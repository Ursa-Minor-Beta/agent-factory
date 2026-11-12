import mongoose, { Schema, Document } from 'mongoose';

export interface WebhookDocument extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  agentId: mongoose.Types.ObjectId;
  name: string;
  token: string;
  enabled: boolean;
  handler: string | null;
  lastTriggeredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const webhookSchema = new Schema<WebhookDocument>(
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
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    // Encrypted at rest
    token: {
      type: String,
      required: true,
    },
    enabled: {
      type: Boolean,
      default: true,
    },
    handler: {
      type: String,
      default: null,
    },
    lastTriggeredAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

webhookSchema.index({ userId: 1, createdAt: -1 });

export const WebhookModel = mongoose.model<WebhookDocument>('Webhook', webhookSchema);
