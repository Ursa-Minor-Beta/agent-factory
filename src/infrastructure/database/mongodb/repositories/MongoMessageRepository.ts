import { MessageModel, MessageDocument } from '../models/MessageModel.js';
import type { IMessageRepository } from '../../../../domain/interfaces/repositories/IMessageRepository.js';
import type { Message, CreateMessageDTO } from '../../../../domain/entities/Message.js';

export class MongoMessageRepository implements IMessageRepository {
  private toEntity(doc: MessageDocument): Message {
    return {
      id: doc._id.toString(),
      sessionId: doc.sessionId.toString(),
      role: doc.role,
      content: doc.content,
      toolCalls: doc.toolCalls,
      createdAt: doc.createdAt,
    };
  }

  async findById(id: string): Promise<Message | null> {
    const doc = await MessageModel.findById(id);
    return doc ? this.toEntity(doc) : null;
  }

  async findBySessionId(
    sessionId: string,
    options?: { limit?: number; offset?: number; order?: 'asc' | 'desc' }
  ): Promise<Message[]> {
    const sortOrder = options?.order === 'desc' ? -1 : 1;

    const docs = await MessageModel.find({ sessionId })
      .sort({ createdAt: sortOrder })
      .skip(options?.offset ?? 0)
      .limit(options?.limit ?? 100);

    return docs.map((doc) => this.toEntity(doc));
  }

  async create(data: CreateMessageDTO): Promise<Message> {
    const doc = await MessageModel.create({
      sessionId: data.sessionId,
      role: data.role,
      content: data.content,
      toolCalls: data.toolCalls,
    });
    return this.toEntity(doc);
  }

  async createMany(data: CreateMessageDTO[]): Promise<Message[]> {
    const docs = await MessageModel.insertMany(
      data.map((d) => ({
        sessionId: d.sessionId,
        role: d.role,
        content: d.content,
        toolCalls: d.toolCalls,
      }))
    );
    return docs.map((doc) => this.toEntity(doc as unknown as MessageDocument));
  }

  async deleteBySessionId(sessionId: string): Promise<number> {
    const result = await MessageModel.deleteMany({ sessionId });
    return result.deletedCount;
  }

  async count(sessionId: string): Promise<number> {
    return MessageModel.countDocuments({ sessionId });
  }
}
