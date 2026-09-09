import { SessionModel, SessionDocument } from '../models/SessionModel.js';
import type { ISessionRepository } from '../../../../domain/interfaces/repositories/ISessionRepository.js';
import type { Session, CreateSessionDTO, UpdateSessionDTO, SessionStatus } from '../../../../domain/entities/Session.js';

export class MongoSessionRepository implements ISessionRepository {
  private toEntity(doc: SessionDocument): Session {
    return {
      id: doc._id.toString(),
      userId: doc.userId.toString(),
      agentId: doc.agentId.toString(),
      title: doc.title,
      status: doc.status,
      incognito: doc.incognito,
      agentNotes: doc.agentNotes ?? '',
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  async findById(id: string): Promise<Session | null> {
    const doc = await SessionModel.findById(id);
    return doc ? this.toEntity(doc) : null;
  }

  async findByUserId(
    userId: string,
    options?: { agentId?: string; status?: SessionStatus; limit?: number; offset?: number }
  ): Promise<Session[]> {
    const query: Record<string, unknown> = { userId };
    if (options?.agentId) {
      query.agentId = options.agentId;
    }
    if (options?.status) {
      query.status = options.status;
    }

    const docs = await SessionModel.find(query)
      .sort({ createdAt: -1 })
      .skip(options?.offset ?? 0)
      .limit(options?.limit ?? 50);

    return docs.map((doc) => this.toEntity(doc));
  }

  async findByAgentId(
    agentId: string,
    options?: { userId?: string; limit?: number }
  ): Promise<Session[]> {
    const query: Record<string, unknown> = { agentId };
    if (options?.userId) {
      query.userId = options.userId;
    }

    const docs = await SessionModel.find(query)
      .sort({ createdAt: -1 })
      .limit(options?.limit ?? 50);

    return docs.map((doc) => this.toEntity(doc));
  }

  async create(data: CreateSessionDTO): Promise<Session> {
    const doc = await SessionModel.create({
      userId: data.userId,
      agentId: data.agentId,
      title: data.title ?? null,
      status: 'active',
      incognito: data.incognito ?? false,
    });
    return this.toEntity(doc);
  }

  async update(id: string, data: UpdateSessionDTO): Promise<Session | null> {
    const doc = await SessionModel.findByIdAndUpdate(
      id,
      { $set: data },
      { new: true }
    );
    return doc ? this.toEntity(doc) : null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await SessionModel.findByIdAndDelete(id);
    return result !== null;
  }

  async deleteByAgentId(agentId: string): Promise<number> {
    const result = await SessionModel.deleteMany({ agentId });
    return result.deletedCount;
  }

  async archive(id: string): Promise<Session | null> {
    const doc = await SessionModel.findByIdAndUpdate(
      id,
      { $set: { status: 'archived' } },
      { new: true }
    );
    return doc ? this.toEntity(doc) : null;
  }

  async count(userId: string): Promise<number> {
    return SessionModel.countDocuments({ userId });
  }

  async setAgentNotes(id: string, notes: string): Promise<Session | null> {
    const doc = await SessionModel.findByIdAndUpdate(
      id,
      { $set: { agentNotes: notes } },
      { new: true }
    );
    return doc ? this.toEntity(doc) : null;
  }
}
