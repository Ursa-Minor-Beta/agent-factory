/**
 * Memory collection (schema) builtin tool handlers
 */

import type { MemorySchemaField } from '../../../../domain/entities/Memory.js';
import type { ToolHandler } from './types.js';
import * as collectionService from '../../../../domain/services/collection.service.js';

/**
 * Handle create_collection tool
 */
export const handleCreateCollection: ToolHandler = async (args, options) => {
  if (!options.memorySchemaRepo) {
    throw new Error('create_collection tool requires memorySchemaRepo in options');
  }
  if (!options.userId) {
    throw new Error('create_collection tool requires userId in options');
  }

  const name = String(args.name ?? '');
  const description = args.description ? String(args.description) : undefined;
  const fields = args.fields as MemorySchemaField[] | undefined;

  try {
    const schema = await collectionService.createCollection(
      options.userId,
      name,
      description,
      fields ?? [],
      { memorySchemaRepo: options.memorySchemaRepo }
    );

    return {
      success: true,
      collectionId: schema.id,
      name: schema.name,
      message: `Collection "${name}" created successfully with ${schema.fields.length} fields`,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create collection',
    };
  }
};

/**
 * Handle get_collection tool
 */
export const handleGetCollection: ToolHandler = async (args, options) => {
  if (!options.memorySchemaRepo) {
    throw new Error('get_collection tool requires memorySchemaRepo in options');
  }
  if (!options.userId) {
    throw new Error('get_collection tool requires userId in options');
  }

  const name = String(args.name ?? '');

  try {
    const schema = await collectionService.getCollection(
      options.userId,
      name,
      { memorySchemaRepo: options.memorySchemaRepo }
    );

    return {
      success: true,
      collection: {
        id: schema.id,
        name: schema.name,
        description: schema.description,
        fields: schema.fields,
        createdAt: schema.createdAt,
        updatedAt: schema.updatedAt,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get collection',
    };
  }
};

/**
 * Handle update_collection tool
 */
export const handleUpdateCollection: ToolHandler = async (args, options) => {
  if (!options.memorySchemaRepo) {
    throw new Error('update_collection tool requires memorySchemaRepo in options');
  }
  if (!options.userId) {
    throw new Error('update_collection tool requires userId in options');
  }

  const name = String(args.name ?? '');
  const updates: { newName?: string; description?: string; fields?: MemorySchemaField[] } = {};

  if (args.newName !== undefined) {
    updates.newName = String(args.newName);
  }
  if (args.description !== undefined) {
    updates.description = String(args.description);
  }
  if (args.fields !== undefined) {
    updates.fields = args.fields as MemorySchemaField[];
  }

  try {
    const updatedSchema = await collectionService.updateCollection(
      options.userId,
      name,
      updates,
      { memorySchemaRepo: options.memorySchemaRepo }
    );

    return {
      success: true,
      collectionId: updatedSchema.id,
      name: updatedSchema.name,
      message: `Collection "${updatedSchema.name}" updated successfully`,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update collection',
    };
  }
};

/**
 * Handle list_collections tool
 */
export const handleListCollections: ToolHandler = async (args, options) => {
  if (!options.memorySchemaRepo) {
    throw new Error('list_collections tool requires memorySchemaRepo in options');
  }
  if (!options.userId) {
    throw new Error('list_collections tool requires userId in options');
  }

  const limit = typeof args.limit === 'number' ? args.limit : 50;

  try {
    const collections = await collectionService.listCollections(
      options.userId,
      { limit, includeRecordCounts: true },
      {
        memorySchemaRepo: options.memorySchemaRepo,
        memoryStoreRepo: options.memoryStoreRepo,
      }
    );

    return {
      success: true,
      collections,
      count: collections.length,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list collections',
    };
  }
};

/**
 * Handle delete_collection tool
 */
export const handleDeleteCollection: ToolHandler = async (args, options) => {
  if (!options.memorySchemaRepo) {
    throw new Error('delete_collection tool requires memorySchemaRepo in options');
  }
  if (!options.userId) {
    throw new Error('delete_collection tool requires userId in options');
  }

  const name = String(args.name ?? '');

  try {
    await collectionService.deleteCollection(
      options.userId,
      name,
      { memorySchemaRepo: options.memorySchemaRepo }
    );

    return {
      success: true,
      message: `Collection "${name}" and all its records have been deleted`,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete collection',
    };
  }
};
