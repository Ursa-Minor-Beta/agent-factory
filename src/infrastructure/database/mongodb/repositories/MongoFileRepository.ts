import { FileModel, FileDocument } from '../models/FileModel.js';
import type { IFileRepository, FileListFilters } from '../../../../domain/interfaces/repositories/IFileRepository.js';
import type { File, FileListItem, CreateFileDTO } from '../../../../domain/entities/File.js';
import { escapeRegex } from '../../../../utils/regex.js';

export class MongoFileRepository implements IFileRepository {
  private toEntity(doc: FileDocument): File {
    return {
      id: doc._id.toString(),
      userId: doc.userId.toString(),
      name: doc.name,
      mimeType: doc.mimeType,
      size: doc.size,
      data: doc.data,
      createdAt: doc.createdAt,
    };
  }

  /**
   * Calculate actual byte size from base64 string
   */
  private calculateSize(base64: string): number {
    return Buffer.from(base64, 'base64').length;
  }

  async findById(id: string): Promise<File | null> {
    const doc = await FileModel.findById(id);
    return doc ? this.toEntity(doc) : null;
  }

  async findByIds(ids: string[]): Promise<File[]> {
    const docs = await FileModel.find({ _id: { $in: ids } });
    return docs.map((doc) => this.toEntity(doc));
  }

  async findByUserId(
    userId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<File[]> {
    const docs = await FileModel.find({ userId })
      .sort({ createdAt: -1, _id: -1 })
      .skip(options?.offset ?? 0)
      .limit(options?.limit ?? 100);
    return docs.map((doc) => this.toEntity(doc));
  }

  async listByUserId(
    userId: string,
    options?: FileListFilters & { limit?: number; offset?: number; sortBy?: 'name' | 'size' | 'mimeType' | 'createdAt'; sortOrder?: 'asc' | 'desc' }
  ): Promise<FileListItem[]> {
    const docs = await FileModel.find(this.buildListQuery(userId, options))
      .select({ _id: 1, name: 1, mimeType: 1, size: 1, createdAt: 1 })
      .sort({ [options?.sortBy ?? 'createdAt']: options?.sortOrder === 'asc' ? 1 : -1, _id: -1 })
      .skip(options?.offset ?? 0)
      .limit(options?.limit ?? 100);
    return docs.map((doc) => ({
      id: doc._id.toString(),
      name: doc.name,
      mimeType: doc.mimeType,
      size: doc.size,
      createdAt: doc.createdAt,
    }));
  }

  async countByUserId(userId: string, filters?: FileListFilters): Promise<number> {
    return FileModel.countDocuments(this.buildListQuery(userId, filters));
  }

  private buildListQuery(userId: string, filters?: FileListFilters): Record<string, unknown> {
    const query: Record<string, unknown> = { userId };
    if (filters?.name) {
      query.name = { $regex: escapeRegex(filters.name), $options: 'i' };
    }
    if (filters?.mimeType) {
      query.mimeType = { $regex: `^${escapeRegex(filters.mimeType)}`, $options: 'i' };
    }
    if (filters?.createdAfter || filters?.createdBefore) {
      query.createdAt = {
        ...(filters.createdAfter ? { $gte: filters.createdAfter } : {}),
        ...(filters.createdBefore ? { $lte: filters.createdBefore } : {}),
      };
    }
    return query;
  }

  async create(data: CreateFileDTO): Promise<File> {
    const doc = await FileModel.create({
      userId: data.userId,
      name: data.name,
      mimeType: data.mimeType,
      size: this.calculateSize(data.data),
      data: data.data,
    });
    return this.toEntity(doc);
  }

  async createMany(data: CreateFileDTO[]): Promise<File[]> {
    const docs = await FileModel.insertMany(
      data.map((d) => ({
        userId: d.userId,
        name: d.name,
        mimeType: d.mimeType,
        size: this.calculateSize(d.data),
        data: d.data,
      }))
    );
    return docs.map((doc) => this.toEntity(doc as unknown as FileDocument));
  }

  async deleteBy(options: { id?: string | string[]; userId?: string }): Promise<number> {
    const query: Record<string, unknown> = {};

    if (options.id) {
      query._id = Array.isArray(options.id) ? { $in: options.id } : options.id;
    }

    if (options.userId) {
      query.userId = options.userId;
    }

    return (await FileModel.deleteMany(query)).deletedCount ?? 0;
  }
}
