/**
 * Memory Service - Centralized business logic for memory operations
 * Reused across builtin tools, memory nodes, and HTTP routes
 */

import type { IMemorySchemaRepository } from '../interfaces/repositories/IMemorySchemaRepository.js';
import type { IMemoryStoreRepository } from '../interfaces/repositories/IMemoryStoreRepository.js';
import type {
  MemoryRecord,
  MemorySchema,
  MemorySchemaField,
} from '../entities/Memory.js';
import { MEMORY_RESERVED_FIELDS } from '../entities/Memory.js';

export interface MemoryServiceDependencies {
  memorySchemaRepo: IMemorySchemaRepository;
  memoryStoreRepo: IMemoryStoreRepository;
}

/**
 * Validate memory data
 * - Checks for reserved system fields
 * - Validates required fields from schema
 */
export function validateMemoryData(
  data: Record<string, unknown>,
  fields: MemorySchemaField[]
): void {
  // 1. Check for reserved system fields
  const reservedFieldsUsed = Object.keys(data).filter((key) =>
    MEMORY_RESERVED_FIELDS.includes(key as never)
  );
  if (reservedFieldsUsed.length > 0) {
    throw new Error(
      `Cannot override reserved fields: ${reservedFieldsUsed.join(', ')}`
    );
  }

  // 2. Check required fields from schema
  for (const field of fields) {
    if (field.required && !(field.name in data)) {
      throw new Error(`Required field "${field.name}" is missing`);
    }
  }

  // 3. Additional type validation could be added here
  // For example, check that string fields are strings, etc.
}

/**
 * Find schema by collection name
 */
export async function findCollectionSchema(
  userId: string,
  collection: string,
  deps: MemoryServiceDependencies
): Promise<MemorySchema> {
  const schema = await deps.memorySchemaRepo.findByName(userId, collection);
  if (!schema) {
    throw new Error(`Collection "${collection}" not found`);
  }
  return schema;
}

/**
 * Save a new record to a memory collection
 */
export async function saveMemoryRecord(
  userId: string,
  collection: string,
  data: Record<string, unknown>,
  deps: MemoryServiceDependencies
): Promise<MemoryRecord> {
  if (!collection) {
    throw new Error('Collection name is required');
  }

  if (Object.keys(data).length === 0) {
    throw new Error('At least one data field is required');
  }

  // Find schema and validate data
  const schema = await findCollectionSchema(userId, collection, deps);
  validateMemoryData(data, schema.fields);

  // Create record
  const record = await deps.memoryStoreRepo.create({
    schemaId: schema.id,
    ...data,
  });

  return record;
}

/**
 * Search records in a memory collection
 */
export async function searchMemoryRecords(
  userId: string,
  collection: string,
  options: {
    filters?: Record<string, unknown>;
    limit?: number;
    offset?: number;
    sort?: { field: string; direction: 'asc' | 'desc' };
  },
  deps: MemoryServiceDependencies
): Promise<MemoryRecord[]> {
  if (!collection) {
    throw new Error('Collection name is required');
  }

  // Find schema
  const schema = await findCollectionSchema(userId, collection, deps);

  // Search records
  const results = await deps.memoryStoreRepo.search({
    schemaId: schema.id,
    filters: options.filters,
    limit: options.limit ?? 10,
    offset: options.offset ?? 0,
    sort: options.sort,
  });

  return results.map((r) => r.record);
}

/**
 * Update an existing memory record
 */
export async function updateMemoryRecord(
  userId: string,
  collection: string,
  id: string,
  data: Record<string, unknown>,
  deps: MemoryServiceDependencies
): Promise<MemoryRecord> {
  if (!collection) {
    throw new Error('Collection name is required');
  }

  if (!id) {
    throw new Error('Record ID is required');
  }

  if (Object.keys(data).length === 0) {
    throw new Error('At least one field to update is required');
  }

  // Find schema and validate data
  const schema = await findCollectionSchema(userId, collection, deps);
  validateMemoryData(data, schema.fields);

  // Verify record exists and belongs to this collection
  const existingRecord = await deps.memoryStoreRepo.findById(id);
  if (!existingRecord) {
    throw new Error(`Record "${id}" not found`);
  }
  if (existingRecord.schemaId !== schema.id) {
    throw new Error(`Record "${id}" does not belong to collection "${collection}"`);
  }

  // Update record
  const updated = await deps.memoryStoreRepo.update(id, data);
  if (!updated) {
    throw new Error('Failed to update record');
  }

  return updated;
}

/**
 * Delete a memory record
 */
export async function deleteMemoryRecord(
  userId: string,
  collection: string,
  id: string,
  deps: MemoryServiceDependencies
): Promise<void> {
  if (!collection) {
    throw new Error('Collection name is required');
  }

  if (!id) {
    throw new Error('Record ID is required');
  }

  // Find schema
  const schema = await findCollectionSchema(userId, collection, deps);

  // Verify record exists and belongs to this collection
  const existingRecord = await deps.memoryStoreRepo.findById(id);
  if (!existingRecord) {
    throw new Error(`Record "${id}" not found`);
  }
  if (existingRecord.schemaId !== schema.id) {
    throw new Error(`Record "${id}" does not belong to collection "${collection}"`);
  }

  // Delete record
  const deleted = await deps.memoryStoreRepo.delete(id);
  if (!deleted) {
    throw new Error('Failed to delete record');
  }
}

/**
 * Get a single memory record by ID
 */
export async function getMemoryRecord(
  userId: string,
  collection: string,
  id: string,
  deps: MemoryServiceDependencies
): Promise<MemoryRecord> {
  if (!collection) {
    throw new Error('Collection name is required');
  }

  if (!id) {
    throw new Error('Record ID is required');
  }

  // Find schema
  const schema = await findCollectionSchema(userId, collection, deps);

  // Get record
  const record = await deps.memoryStoreRepo.findById(id);
  if (!record) {
    throw new Error(`Record "${id}" not found`);
  }

  // Verify belongs to collection
  if (record.schemaId !== schema.id) {
    throw new Error(`Record "${id}" does not belong to collection "${collection}"`);
  }

  return record;
}
