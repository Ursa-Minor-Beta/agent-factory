import { Message, CreateMessageDTO } from '../../entities/Message.js';

export interface IMessageRepository {
  findById(id: string): Promise<Message | null>;
  findBySessionId(sessionId: string, options?: {
    limit?: number;
    offset?: number;
    order?: 'asc' | 'desc';
    roles?: Array<'user' | 'assistant' | 'system'>;
    fields?: Array<keyof Message>;
  }): Promise<Message[]>;
  create(data: CreateMessageDTO): Promise<Message>;
  createMany(data: CreateMessageDTO[]): Promise<Message[]>;
  deleteBySessionId(sessionId: string): Promise<number>;
  count(sessionId: string): Promise<number>;
}
