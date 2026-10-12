/**
 * Collection (Memory Schema) Service - Centralized business logic
 * Reused across builtin tools and HTTP routes
 */

import type { IMemorySchemaRepository, MemorySchemaQueryOptions } from '../interfaces/repositories/IMemorySchemaRepository.js';
import type { IMemoryStoreRepository } from '../interfaces/repositories/IMemoryStoreRepository.js';
import type {
  MemorySchema,
  MemorySchemaField,
  UpdateMemorySchemaDTO,
} from '../entities/Memory.js';

export interface CollectionServiceDependencies {
  memorySchemaRepo: IMemorySchemaRepository;
  memoryStoreRepo?: IMemoryStoreRepository; // Optional, only needed for record counts
}

export interface CreateCollectionOptions {
  workspaceId?: string;
}

export interface GetCollectionOptions {
  workspaceId?: string;
}

/**
 * Create a new collection (memory schema)
 */
export async function createCollection(
  userId: string,
  name: string,
  description: string | undefined,
  fields: MemorySchemaField[],
  deps: CollectionServiceDependencies,
  options?: CreateCollectionOptions
): Promise<MemorySchema> {
  if (!name) {
    throw new Error('Collection name is required');
  }

  if (!fields || fields.length === 0) {
    throw new Error('At least one field is required');
  }

  // Check if collection already exists in the same scope
  const workspaceId = options?.workspaceId ?? null;
  const nameExists = await deps.memorySchemaRepo.nameExists(userId, name, workspaceId);
  if (nameExists) {
    const scope = workspaceId ? 'workspace' : 'global';
    throw new Error(`Collection "${name}" already exists in ${scope} scope`);
  }

  const schema = await deps.memorySchemaRepo.create({
    userId,
    name,
    description,
    fields,
    workspaceId: options?.workspaceId,
  });

  return schema;
}

/**
 * Get a collection by name
 * @param options.workspaceId - If provided, searches workspace-scoped first, then global
 */
export async function getCollection(
  userId: string,
  name: string,
  deps: CollectionServiceDependencies,
  options?: GetCollectionOptions
): Promise<MemorySchema> {
  if (!name) {
    throw new Error('Collection name is required');
  }

  // Search in workspace first, then global
  const workspaceIds: (string | null)[] = options?.workspaceId
    ? [options.workspaceId, null]
    : [null];

  const schema = await deps.memorySchemaRepo.findByName(userId, name, workspaceIds);
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
    workspaceId?: string | null;
  },
  deps: CollectionServiceDependencies,
  options?: GetCollectionOptions
): Promise<MemorySchema> {
  if (!name) {
    throw new Error('Collection name is required');
  }

  // Search in workspace first, then global
  const workspaceIds: (string | null)[] = options?.workspaceId
    ? [options.workspaceId, null]
    : [null];

  const existingSchema = await deps.memorySchemaRepo.findByName(userId, name, workspaceIds);
  if (!existingSchema) {
    throw new Error(`Collection "${name}" not found`);
  }

  const updateData: UpdateMemorySchemaDTO = {};

  if (updates.newName !== undefined) {
    // Check if new name is already used in the same workspace scope
    const targetWorkspaceId = updates.workspaceId !== undefined
      ? updates.workspaceId
      : existingSchema.workspaceId;
    const nameExists = await deps.memorySchemaRepo.nameExists(
      userId,
      updates.newName,
      targetWorkspaceId ?? null,
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

  if (updates.workspaceId !== undefined) {
    updateData.workspaceId = updates.workspaceId;
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
    workspaceId?: string | null;
  },
  deps: CollectionServiceDependencies
): Promise<Array<{
  id: string;
  name: string;
  description: string | null;
  fieldCount: number;
  recordCount?: number;
  workspaceId?: string;
  createdAt: Date;
  updatedAt: Date;
}>> {
  const limit = options.limit ?? 50;
  const queryOptions: MemorySchemaQueryOptions = {
    limit,
    workspaceId: options.workspaceId,
  };

  const schemas = await deps.memorySchemaRepo.findByUserId(userId, queryOptions);

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
    workspaceId: s.workspaceId,
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
  deps: CollectionServiceDependencies,
  options?: GetCollectionOptions
): Promise<void> {
  if (!name) {
    throw new Error('Collection name is required');
  }

  // Search in workspace first, then global
  const workspaceIds: (string | null)[] = options?.workspaceId
    ? [options.workspaceId, null]
    : [null];

  const schema = await deps.memorySchemaRepo.findByName(userId, name, workspaceIds);
  if (!schema) {
    throw new Error(`Collection "${name}" not found`);
  }

  const deleted = await deps.memorySchemaRepo.delete(schema.id);
  if (!deleted) {
    throw new Error('Failed to delete collection');
  }
}

/**
 * Get all collections available to an agent (global + workspace-scoped)
 */
export async function getAvailableCollections(
  userId: string,
  workspaceId: string | undefined,
  deps: CollectionServiceDependencies
): Promise<MemorySchema[]> {
  return deps.memorySchemaRepo.findAvailableForAgent(userId, workspaceId);
}
