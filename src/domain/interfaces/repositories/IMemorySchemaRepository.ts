import type {
  MemorySchema,
  CreateMemorySchemaDTO,
  UpdateMemorySchemaDTO,
} from '../../entities/Memory.js';

export interface IMemorySchemaRepository {
  /**
   * Find a schema by its ID
   */
  findById(id: string): Promise<MemorySchema | null>;

  /**
   * Find a schema by user ID and name
   */
  findByName(userId: string, name: string): Promise<MemorySchema | null>;

  /**
   * Find all schemas for a user
   */
  findByUserId(
    userId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<MemorySchema[]>;

  /**
   * Create a new memory schema
   */
  create(data: CreateMemorySchemaDTO): Promise<MemorySchema>;

  /**
   * Update an existing schema
   */
  update(id: string, data: UpdateMemorySchemaDTO): Promise<MemorySchema | null>;

  /**
   * Delete a schema (and optionally all its records)
   */
  delete(id: string): Promise<boolean>;

  /**
   * Check if a schema name is already used by user
   */
  nameExists(userId: string, name: string, excludeId?: string): Promise<boolean>;

  /**
   * Count schemas for a user
   */
  count(userId: string): Promise<number>;
}
