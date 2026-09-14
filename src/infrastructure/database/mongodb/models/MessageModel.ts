import mongoose, { Schema, Document } from 'mongoose';
import type { MessageRole, ToolCall } from '../../../../domain/entities/Message.js';

export interface MessageDocument extends Document {
  _id: mongoose.Types.ObjectId;
  sessionId: mongoose.Types.ObjectId;
  runId?: mongoose.Types.ObjectId;
  role: MessageRole;
  content: string;
  toolCalls?: ToolCall[];
  createdAt: Date;
}

const toolCallSchema = new Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    arguments: { type: Schema.Types.Mixed },
    result: { type: Schema.Types.Mixed },
  },
  { _id: false }
);

const messageSchema = new Schema<MessageDocument>(
  {
    sessionId: {
      type: Schema.Types.ObjectId,
      ref: 'Session',
      required: true,
    },
    runId: {
      type: Schema.Types.ObjectId,
      ref: 'Run',
    },
    role: {
      type: String,
      enum: ['user', 'assistant', 'system', 'tool'],
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    toolCalls: {
      type: [toolCallSchema],
      default: undefined,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

messageSchema.index({ sessionId: 1, createdAt: 1 });

export const MessageModel = mongoose.model<MessageDocument>('Message', messageSchema);
