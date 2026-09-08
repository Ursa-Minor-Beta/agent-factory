import { ApiKeyModel, ApiKeyDocument } from '../models/ApiKeyModel.js';
import type { IApiKeyRepository } from '../../../../domain/interfaces/repositories/IApiKeyRepository.js';
import type { ApiKey, CreateApiKeyDTO } from '../../../../domain/entities/ApiKey.js';

export class MongoApiKeyRepository implements IApiKeyRepository {
  private toEntity(doc: ApiKeyDocument): ApiKey {
    return {
      id: doc._id.toString(),
      userId: doc.userId.toString(),
      keyHash: doc.keyHash,
      keyPrefix: doc.keyPrefix,
      name: doc.name,
      permissions: doc.permissions,
      lastUsedAt: doc.lastUsedAt,
      expiresAt: doc.expiresAt,
      createdAt: doc.createdAt,
    };
  }

  async findById(id: string): Promise<ApiKey | null> {
    const doc = await ApiKeyModel.findById(id);
    return doc ? this.toEntity(doc) : null;
  }

  async findByKeyHash(keyHash: string): Promise<ApiKey | null> {
    const doc = await ApiKeyModel.findOne({ keyHash });
    return doc ? this.toEntity(doc) : null;
  }

  async findByUserId(userId: string): Promise<ApiKey[]> {
    const docs = await ApiKeyModel.find({ userId });
    return docs.map((doc) => this.toEntity(doc));
  }

  async create(
    data: CreateApiKeyDTO & { keyHash: string; keyPrefix: string }
  ): Promise<ApiKey> {
    const doc = await ApiKeyModel.create({
      userId: data.userId,
      keyHash: data.keyHash,
      keyPrefix: data.keyPrefix,
      name: data.name,
      permissions: data.permissions,
      expiresAt: data.expiresAt ?? null,
    });
    return this.toEntity(doc);
  }

  async updateLastUsed(id: string): Promise<void> {
    await ApiKeyModel.findByIdAndUpdate(id, { $set: { lastUsedAt: new Date() } });
  }

  async delete(id: string): Promise<boolean> {
    const result = await ApiKeyModel.findByIdAndDelete(id);
    return result !== null;
  }
}
