import mongoose from 'mongoose';
import { SessionModel, SessionDocument } from '../models/SessionModel.js';
import type { ISessionRepository } from '../../../../domain/interfaces/repositories/ISessionRepository.js';
import type { Session, CreateSessionDTO, UpdateSessionDTO, SessionStatus } from '../../../../domain/entities/Session.js';

export class MongoSessionRepository implements ISessionRepository {
  private toEntity(doc: SessionDocument & { agentName?: string }): Session {
    return {
      id: doc._id.toString(),
      userId: doc.userId.toString(),
      agentId: doc.agentId.toString(),
      agentName: doc.agentName,
      title: doc.title,
      status: doc.status,
      incognito: doc.incognito,
      notes: doc.notes,
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
    const match: Record<string, unknown> = { userId: new mongoose.Types.ObjectId(userId) };
    if (options?.agentId) {
      match.agentId = new mongoose.Types.ObjectId(options.agentId);
    }
    if (options?.status) {
      match.status = options.status;
    }

    const docs = await SessionModel.aggregate([
      { $match: match },
      { $sort: { createdAt: -1 } },
      { $skip: options?.offset ?? 0 },
      { $limit: options?.limit ?? 50 },
      {
        $lookup: {
          from: 'agents',
          localField: 'agentId',
          foreignField: '_id',
          as: 'agent',
        },
      },
      { $addFields: { agentName: { $arrayElemAt: ['$agent.name', 0] } } },
      { $project: { agent: 0 } },
    ]);

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

  async deleteBy(options: { id?: string | string[]; agentId?: string | string[]; userId?: string }): Promise<number> {
    const query: Record<string, unknown> = {};

    if (options.id) {
      query._id = Array.isArray(options.id)
        ? { $in: options.id.map((idStr) => new mongoose.Types.ObjectId(idStr)) }
        : new mongoose.Types.ObjectId(options.id);
    }

    if (options.agentId) {
      query.agentId = Array.isArray(options.agentId) ? { $in: options.agentId } : options.agentId;
    }

    if (options.userId) {
      query.userId = options.userId;
    }

    return (await SessionModel.deleteMany(query)).deletedCount ?? 0;
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
}
