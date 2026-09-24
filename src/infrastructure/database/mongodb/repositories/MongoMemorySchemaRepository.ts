import { MemorySchemaModel, MemorySchemaDocument } from '../models/MemorySchemaModel.js';
import type { IMemorySchemaRepository } from '../../../../domain/interfaces/repositories/IMemorySchemaRepository.js';
import type {
  MemorySchema,
  CreateMemorySchemaDTO,
  UpdateMemorySchemaDTO,
} from '../../../../domain/entities/Memory.js';

export class MongoMemorySchemaRepository implements IMemorySchemaRepository {
  private toEntity(doc: MemorySchemaDocument): MemorySchema {
    return {
      id: doc._id.toString(),
      userId: doc.userId.toString(),
      name: doc.name,
      description: doc.description,
      fields: doc.fields.map((f) => ({
        name: f.name,
        type: f.type,
        required: f.required,
        index: f.index,
        description: f.description ?? undefined,
        default: f.default ?? undefined,
        items: f.items ?? undefined,
      })),
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  async findById(id: string): Promise<MemorySchema | null> {
    const doc = await MemorySchemaModel.findById(id);
    return doc ? this.toEntity(doc) : null;
  }

  async findByName(userId: string, name: string): Promise<MemorySchema | null> {
    const doc = await MemorySchemaModel.findOne({ userId, name });
    return doc ? this.toEntity(doc) : null;
  }

  async findByUserId(
    userId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<MemorySchema[]> {
    const docs = await MemorySchemaModel.find({ userId })
      .sort({ createdAt: -1 })
      .skip(options?.offset ?? 0)
      .limit(options?.limit ?? 50);

    return docs.map((doc) => this.toEntity(doc));
  }

  async create(data: CreateMemorySchemaDTO): Promise<MemorySchema> {
    const doc = await MemorySchemaModel.create({
      userId: data.userId,
      name: data.name,
      description: data.description ?? null,
      fields: data.fields,
    });
    return this.toEntity(doc);
  }

  async update(id: string, data: UpdateMemorySchemaDTO): Promise<MemorySchema | null> {
    const updateData: Record<string, unknown> = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.fields !== undefined) updateData.fields = data.fields;

    const doc = await MemorySchemaModel.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true }
    );
    return doc ? this.toEntity(doc) : null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await MemorySchemaModel.findByIdAndDelete(id);
    return result !== null;
  }

  async nameExists(userId: string, name: string, excludeId?: string): Promise<boolean> {
    const query: Record<string, unknown> = { userId, name };
    if (excludeId) {
      query._id = { $ne: excludeId };
    }
    const count = await MemorySchemaModel.countDocuments(query);
    return count > 0;
  }

  async count(userId: string): Promise<number> {
    return MemorySchemaModel.countDocuments({ userId });
  }
}
