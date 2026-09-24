import type {
  MemoryRecord,
  CreateMemoryRecordDTO,
  UpdateMemoryRecordDTO,
  MemorySearchOptions,
  MemorySearchResult,
} from '../../entities/Memory.js';

export interface IMemoryStoreRepository {
  /**
   * Find a record by its ID
   */
  findById(id: string): Promise<MemoryRecord | null>;

  /**
   * Find records by schema ID with optional filters
   */
  findBySchemaId(
    schemaId: string,
    options?: { limit?: number; offset?: number; sort?: { field: string; direction: 'asc' | 'desc' } }
  ): Promise<MemoryRecord[]>;

  /**
   * Search records with filters, text query, or semantic search
   */
  search(options: MemorySearchOptions): Promise<MemorySearchResult[]>;

  /**
   * Create a new memory record
   */
  create(data: CreateMemoryRecordDTO): Promise<MemoryRecord>;

  /**
   * Create multiple records at once
   */
  createMany(data: CreateMemoryRecordDTO[]): Promise<MemoryRecord[]>;

  /**
   * Update an existing record
   */
  update(id: string, data: UpdateMemoryRecordDTO): Promise<MemoryRecord | null>;

  /**
   * Delete a record by ID
   */
  delete(id: string): Promise<boolean>;

  /**
   * Delete all records for a schema
   */
  deleteBySchemaId(schemaId: string): Promise<number>;

  /**
   * Delete records matching filters
   */
  deleteMany(schemaId: string, filters: Record<string, unknown>): Promise<number>;

  /**
   * Count records for a schema with optional filters
   */
  count(schemaId: string, filters?: Record<string, unknown>): Promise<number>;

  /**
   * Count records for multiple schemas in a single query
   * Returns a map of schemaId -> count
   */
  countBySchemaIds(schemaIds: string[]): Promise<Map<string, number>>;

  /**
   * Aggregate records (for statistics, grouping)
   */
  aggregate(
    schemaId: string,
    pipeline: Record<string, unknown>[]
  ): Promise<Record<string, unknown>[]>;
}
