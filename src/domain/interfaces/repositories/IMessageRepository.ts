import { Message, CreateMessageDTO } from '../../entities/Message.js';

export interface IMessageRepository {
  findById(id: string): Promise<Message | null>;
  findBySessionId(sessionId: string, options?: { limit?: number; offset?: number; order?: 'asc' | 'desc' }): Promise<Message[]>;
  create(data: CreateMessageDTO): Promise<Message>;
  createMany(data: CreateMessageDTO[]): Promise<Message[]>;
  deleteBySessionId(sessionId: string): Promise<number>;
  count(sessionId: string): Promise<number>;
}
