import mongoose from 'mongoose';
import { MemoryRecordModel, MemoryRecordDocument } from '../models/MemoryStoreModel.js';
import type { IMemoryStoreRepository } from '../../../../domain/interfaces/repositories/IMemoryStoreRepository.js';
import type {
  MemoryRecord,
  CreateMemoryRecordDTO,
  UpdateMemoryRecordDTO,
  MemorySearchOptions,
  MemorySearchResult,
} from '../../../../domain/entities/Memory.js';
import { MEMORY_FILTER_OPERATORS } from '../../../../domain/entities/Memory.js';

const ALLOWED_FILTER_OPERATORS = new Set<string>(MEMORY_FILTER_OPERATORS);

function assertSafeFilter(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(assertSafeFilter);
    return;
  }
  if (value === null || typeof value !== 'object' || value instanceof Date) return;
  for (const [key, nested] of Object.entries(value)) {
    if (key.startsWith('$') && !ALLOWED_FILTER_OPERATORS.has(key)) {
      throw new Error(`Unsupported filter operator: ${key}`);
    }
    assertSafeFilter(nested);
  }
}

/** Build a query scoped to schemaId; schemaId is applied last so filters cannot override it */
function buildScopedQuery(schemaId: string, filters?: Record<string, unknown>): Record<string, unknown> {
  assertSafeFilter(filters);
  return { ...(filters ?? {}), schemaId };
}

export class MongoMemoryStoreRepository implements IMemoryStoreRepository {
  private toEntity(doc: MemoryRecordDocument): MemoryRecord {
    const obj = doc.toObject();
    const { _id, __v, schemaId, createdAt, updatedAt, ...userFields } = obj;

    return {
      id: _id.toString(),
      schemaId: schemaId.toString(),
      createdAt,
      updatedAt,
      ...userFields, // User-defined schema fields at root level
    };
  }

  async findById(id: string): Promise<MemoryRecord | null> {
    const doc = await MemoryRecordModel.findById(id);
    return doc ? this.toEntity(doc) : null;
  }

  async findBySchemaId(
    schemaId: string,
    options?: {
      limit?: number;
      offset?: number;
      sort?: { field: string; direction: 'asc' | 'desc' };
      filters?: Record<string, unknown>;
    }
  ): Promise<MemoryRecord[]> {
    const sortField = options?.sort?.field ?? 'createdAt';
    const sortDirection = options?.sort?.direction === 'asc' ? 1 : -1;

    const docs = await MemoryRecordModel.find(buildScopedQuery(schemaId, options?.filters))
      .sort({ [sortField]: sortDirection })
      .skip(options?.offset ?? 0)
      .limit(options?.limit ?? 50);

    return docs.map((doc) => this.toEntity(doc));
  }

  async search(options: MemorySearchOptions): Promise<MemorySearchResult[]> {
    const query = buildScopedQuery(options.schemaId, options.filters);

    // Build sort
    const sortField = options.sort?.field ?? 'createdAt';
    const sortDirection = options.sort?.direction === 'asc' ? 1 : -1;

    // Projection: system fields are always needed by toEntity
    const projection = options.fields?.length
      ? ['schemaId', 'createdAt', 'updatedAt', ...options.fields].join(' ')
      : undefined;

    const docs = await MemoryRecordModel.find(query, projection)
      .sort({ [sortField]: sortDirection })
      .skip(options.offset ?? 0)
      .limit(options.limit ?? 50);

    return docs.map((doc) => ({
      record: this.toEntity(doc),
    }));
  }

  async create(data: CreateMemoryRecordDTO): Promise<MemoryRecord> {
    const { schemaId, ...userFields } = data;
    const doc = await MemoryRecordModel.create({
      schemaId,
      ...userFields, // User-defined schema fields at root level
    });
    return this.toEntity(doc);
  }

  async createMany(data: CreateMemoryRecordDTO[]): Promise<MemoryRecord[]> {
    const docs = await MemoryRecordModel.insertMany(
      data.map((d) => {
        const { schemaId, ...userFields } = d;
        return {
          schemaId: new mongoose.Types.ObjectId(schemaId),
          ...userFields,
        };
      })
    );
    return docs.map((doc) => this.toEntity(doc as MemoryRecordDocument));
  }

  async update(id: string, data: UpdateMemoryRecordDTO): Promise<MemoryRecord | null> {
    // All fields in data are user-defined schema fields to update
    const doc = await MemoryRecordModel.findByIdAndUpdate(
      id,
      { $set: data },
      { new: true }
    );
    return doc ? this.toEntity(doc) : null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await MemoryRecordModel.findByIdAndDelete(id);
    return result !== null;
  }

  async deleteBySchemaId(schemaId: string): Promise<number> {
    const result = await MemoryRecordModel.deleteMany({ schemaId });
    return result.deletedCount;
  }

  async deleteMany(schemaId: string, filters: Record<string, unknown>): Promise<number> {
    const query = buildScopedQuery(schemaId, filters);

    const result = await MemoryRecordModel.deleteMany(query);
    return result.deletedCount;
  }

  async count(schemaId: string, filters?: Record<string, unknown>): Promise<number> {
    const query = buildScopedQuery(schemaId, filters);

    return MemoryRecordModel.countDocuments(query);
  }

  async countBySchemaIds(schemaIds: string[]): Promise<Map<string, number>> {
    if (schemaIds.length === 0) {
      return new Map();
    }

    const objectIds = schemaIds.map((id) => new mongoose.Types.ObjectId(id));

    const results = await MemoryRecordModel.aggregate([
      { $match: { schemaId: { $in: objectIds } } },
      { $group: { _id: '$schemaId', count: { $sum: 1 } } },
    ] as unknown as mongoose.PipelineStage[]);

    const countMap = new Map<string, number>();
    // Initialize all schema IDs with 0
    for (const id of schemaIds) {
      countMap.set(id, 0);
    }
    // Fill in actual counts
    for (const result of results) {
      countMap.set(result._id.toString(), result.count);
    }

    return countMap;
  }

  async aggregate(
    schemaId: string,
    pipeline: Record<string, unknown>[]
  ): Promise<Record<string, unknown>[]> {
    const fullPipeline = [
      { $match: { schemaId: new mongoose.Types.ObjectId(schemaId) } },
      ...pipeline,
    ] as unknown as mongoose.PipelineStage[];
    return MemoryRecordModel.aggregate(fullPipeline);
  }
}
