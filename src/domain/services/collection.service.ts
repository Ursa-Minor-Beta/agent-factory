/**
 * Collection (Memory Schema) Service - Centralized business logic
 * Reused across builtin tools and HTTP routes
 */

import type { IMemorySchemaRepository } from '../interfaces/repositories/IMemorySchemaRepository.js';
import type { IMemoryStoreRepository } from '../interfaces/repositories/IMemoryStoreRepository.js';
import type {
  MemorySchema,
  MemorySchemaField,
  CreateMemorySchemaDTO,
  UpdateMemorySchemaDTO,
} from '../entities/Memory.js';

export interface CollectionServiceDependencies {
  memorySchemaRepo: IMemorySchemaRepository;
  memoryStoreRepo?: IMemoryStoreRepository; // Optional, only needed for record counts
}

/**
 * Create a new collection (memory schema)
 */
export async function createCollection(
  userId: string,
  name: string,
  description: string | undefined,
  fields: MemorySchemaField[],
  deps: CollectionServiceDependencies
): Promise<MemorySchema> {
  if (!name) {
    throw new Error('Collection name is required');
  }

  if (!fields || fields.length === 0) {
    throw new Error('At least one field is required');
  }

  // Check if collection already exists
  const existing = await deps.memorySchemaRepo.findByName(userId, name);
  if (existing) {
    throw new Error(`Collection "${name}" already exists`);
  }

  const schema = await deps.memorySchemaRepo.create({
    userId,
    name,
    description,
    fields,
  });

  return schema;
}

/**
 * Get a collection by name
 */
export async function getCollection(
  userId: string,
  name: string,
  deps: CollectionServiceDependencies
): Promise<MemorySchema> {
  if (!name) {
    throw new Error('Collection name is required');
  }

  const schema = await deps.memorySchemaRepo.findByName(userId, name);
  if (!schema) {
    throw new Error(`Collection "${name}" not found`);
  }

  return schema;
}

/**
 * Update a collection
 */
export async function updateCollection(
  userId: string,
  name: string,
  updates: {
    newName?: string;
    description?: string;
    fields?: MemorySchemaField[];
  },
  deps: CollectionServiceDependencies
): Promise<MemorySchema> {
  if (!name) {
    throw new Error('Collection name is required');
  }

  const existingSchema = await deps.memorySchemaRepo.findByName(userId, name);
  if (!existingSchema) {
    throw new Error(`Collection "${name}" not found`);
  }

  const updateData: UpdateMemorySchemaDTO = {};

  if (updates.newName !== undefined) {
    // Check if new name is already used
    const nameExists = await deps.memorySchemaRepo.nameExists(
      userId,
      updates.newName,
      existingSchema.id
    );
    if (nameExists) {
      throw new Error(`Collection name "${updates.newName}" is already in use`);
    }
    updateData.name = updates.newName;
  }

  if (updates.description !== undefined) {
    updateData.description = updates.description;
  }

  if (updates.fields !== undefined) {
    if (!Array.isArray(updates.fields) || updates.fields.length === 0) {
      throw new Error('At least one field is required');
    }
    updateData.fields = updates.fields;
  }

  if (Object.keys(updateData).length === 0) {
    throw new Error('No updates provided');
  }

  const updatedSchema = await deps.memorySchemaRepo.update(existingSchema.id, updateData);
  if (!updatedSchema) {
    throw new Error('Failed to update collection');
  }

  return updatedSchema;
}

/**
 * List collections for a user
 */
export async function listCollections(
  userId: string,
  options: {
    limit?: number;
    includeRecordCounts?: boolean;
  },
  deps: CollectionServiceDependencies
): Promise<Array<{
  id: string;
  name: string;
  description: string | null;
  fieldCount: number;
  recordCount?: number;
  createdAt: Date;
  updatedAt: Date;
}>> {
  const limit = options.limit ?? 50;
  const schemas = await deps.memorySchemaRepo.findByUserId(userId, { limit });

  // Get record counts if requested and store repo is available
  let recordCounts = new Map<string, number>();
  if (options.includeRecordCounts && deps.memoryStoreRepo && schemas.length > 0) {
    const schemaIds = schemas.map((s) => s.id);
    recordCounts = await deps.memoryStoreRepo.countBySchemaIds(schemaIds);
  }

  return schemas.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    fieldCount: s.fields.length,
    recordCount: options.includeRecordCounts ? recordCounts.get(s.id) ?? 0 : undefined,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  }));
}

/**
 * Delete a collection
 */
export async function deleteCollection(
  userId: string,
  name: string,
  deps: CollectionServiceDependencies
): Promise<void> {
  if (!name) {
    throw new Error('Collection name is required');
  }

  const schema = await deps.memorySchemaRepo.findByName(userId, name);
  if (!schema) {
    throw new Error(`Collection "${name}" not found`);
  }

  const deleted = await deps.memorySchemaRepo.delete(schema.id);
  if (!deleted) {
    throw new Error('Failed to delete collection');
  }
}
