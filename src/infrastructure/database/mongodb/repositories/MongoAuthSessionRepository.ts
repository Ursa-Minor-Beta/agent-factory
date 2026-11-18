import mongoose from 'mongoose';
import { AuthSessionModel, AuthSessionDocument } from '../models/AuthSessionModel.js';
import type { IAuthSessionRepository } from '../../../../domain/interfaces/repositories/IAuthSessionRepository.js';
import type { AuthSession, CreateAuthSessionDTO } from '../../../../domain/entities/AuthSession.js';

export class MongoAuthSessionRepository implements IAuthSessionRepository {
  private toEntity(doc: AuthSessionDocument): AuthSession {
    return {
      id: doc._id.toString(),
      userId: doc.userId.toString(),
      userAgent: doc.userAgent,
      lastUsedAt: doc.lastUsedAt,
      expiresAt: doc.expiresAt,
      createdAt: doc.createdAt,
    };
  }

  async findById(id: string): Promise<AuthSession | null> {
    if (!mongoose.isValidObjectId(id)) return null;
    const doc = await AuthSessionModel.findById(id);
    return doc ? this.toEntity(doc) : null;
  }

  async create(data: CreateAuthSessionDTO): Promise<AuthSession> {
    const doc = await AuthSessionModel.create({
      userId: data.userId,
      userAgent: data.userAgent ?? null,
      expiresAt: data.expiresAt,
    });
    return this.toEntity(doc);
  }

  async touch(id: string, expiresAt: Date): Promise<void> {
    await AuthSessionModel.findByIdAndUpdate(id, { $set: { lastUsedAt: new Date(), expiresAt } });
  }

  async delete(options: { id?: string; userId?: string }): Promise<number> {
    const query: Record<string, unknown> = {};
    if (options.id) query._id = options.id;
    if (options.userId) query.userId = options.userId;
    if (Object.keys(query).length === 0) return 0;
    const result = await AuthSessionModel.deleteMany(query);
    return result.deletedCount;
  }
}
