/**
 * Memory record builtin tool handlers
 */

import * as memoryService from '../../../../domain/services/memory.service.js';
import type { ToolHandler } from './types.js';

/**
 * Handle memory_store tool - Save data to a memory collection
 */
export const handleMemoryStore: ToolHandler = async (args, options) => {
  if (!options.memorySchemaRepo || !options.memoryStoreRepo) {
    throw new Error('memory_store tool requires memorySchemaRepo and memoryStoreRepo in options');
  }
  if (!options.userId) {
    throw new Error('memory_store tool requires userId in options');
  }

  const collection = String(args.collection ?? '');
  const { collection: _, ...userData } = args; // Extract all fields except 'collection'

  try {
    const record = await memoryService.saveMemoryRecord(
      options.userId,
      collection,
      userData,
      {
        memorySchemaRepo: options.memorySchemaRepo,
        memoryStoreRepo: options.memoryStoreRepo,
      }
    );

    return {
      success: true,
      recordId: record.id,
      message: `Record stored in "${collection}"`,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to store record',
    };
  }
};

/**
 * Handle memory_search tool - Search records in a memory collection
 */
export const handleMemorySearch: ToolHandler = async (args, options) => {
  if (!options.memorySchemaRepo || !options.memoryStoreRepo) {
    throw new Error('memory_search tool requires memorySchemaRepo and memoryStoreRepo in options');
  }
  if (!options.userId) {
    throw new Error('memory_search tool requires userId in options');
  }

  const collection = String(args.collection ?? '');
  const filters = args.filters as Record<string, unknown> | undefined;
  const limit = typeof args.limit === 'number' ? args.limit : 10;

  try {
    const records = await memoryService.searchMemoryRecords(
      options.userId,
      collection,
      { filters, limit },
      {
        memorySchemaRepo: options.memorySchemaRepo,
        memoryStoreRepo: options.memoryStoreRepo,
      }
    );

    return {
      success: true,
      records: records.map((r) => {
        const { id, schemaId, createdAt, updatedAt, ...userFields } = r;
        return {
          id,
          ...userFields, // User-defined schema fields
          createdAt,
        };
      }),
      count: records.length,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to search records',
    };
  }
};

/**
 * Handle memory_update tool - Update a record in a memory collection
 */
export const handleMemoryUpdate: ToolHandler = async (args, options) => {
  if (!options.memorySchemaRepo || !options.memoryStoreRepo) {
    throw new Error('memory_update tool requires memorySchemaRepo and memoryStoreRepo in options');
  }
  if (!options.userId) {
    throw new Error('memory_update tool requires userId in options');
  }

  const collection = String(args.collection ?? '');
  const id = String(args.id ?? '');
  const { collection: _, id: __, ...userData } = args; // Extract update fields

  try {
    const updated = await memoryService.updateMemoryRecord(
      options.userId,
      collection,
      id,
      userData,
      {
        memorySchemaRepo: options.memorySchemaRepo,
        memoryStoreRepo: options.memoryStoreRepo,
      }
    );

    return {
      success: true,
      recordId: updated.id,
      message: `Record updated in "${collection}"`,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update record',
    };
  }
};

/**
 * Handle memory_delete tool - Delete a record from a memory collection
 */
export const handleMemoryDelete: ToolHandler = async (args, options) => {
  if (!options.memorySchemaRepo || !options.memoryStoreRepo) {
    throw new Error('memory_delete tool requires memorySchemaRepo and memoryStoreRepo in options');
  }
  if (!options.userId) {
    throw new Error('memory_delete tool requires userId in options');
  }

  const collection = String(args.collection ?? '');
  const id = String(args.id ?? '');

  try {
    await memoryService.deleteMemoryRecord(
      options.userId,
      collection,
      id,
      {
        memorySchemaRepo: options.memorySchemaRepo,
        memoryStoreRepo: options.memoryStoreRepo,
      }
    );

    return {
      success: true,
      message: `Record deleted from "${collection}"`,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete record',
    };
  }
};
