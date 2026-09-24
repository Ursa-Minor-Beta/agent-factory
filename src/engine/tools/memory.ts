/**
 * Memory tools - Separate tools for each memory operation
 */

import type { BuiltinToolDefinition } from './types.js';

/**
 * Store a new record in memory
 */
export const MEMORY_STORE_TOOL: BuiltinToolDefinition = {
  type: 'builtin',
  name: 'memory_store',
  description: `Save information to long-term memory. Pass collection name and schema fields directly. Use this after discovering important facts, successful actions, or patterns worth remembering.

Example: memory_store({ collection: "contacts", name: "Alice", email: "alice@example.com", role: "engineer" })`,
  parameters: {
    type: 'object',
    properties: {
      collection: {
        type: 'string',
        description: 'Name of the memory collection',
      },
    },
    required: ['collection'],
  },
};

/**
 * Search records in memory
 */
export const MEMORY_SEARCH_TOOL: BuiltinToolDefinition = {
  type: 'builtin',
  name: 'memory_search',
  description: `Search long-term memory for relevant information. Use this before attempting a task to check for past experiences or known patterns.

Example: memory_search({ collection: "contacts", filters: { role: "engineer" }, limit: 5 })`,
  parameters: {
    type: 'object',
    properties: {
      collection: {
        type: 'string',
        description: 'Name of the memory collection',
      },
      filters: {
        type: 'object',
        description: 'Filter by schema field values (exact match). Example: { role: "engineer", status: "active" }',
      },
      limit: {
        type: 'number',
        description: 'Max results (default: 10)',
      },
    },
    required: ['collection'],
  },
};

/**
 * Update an existing record in memory
 */
export const MEMORY_UPDATE_TOOL: BuiltinToolDefinition = {
  type: 'builtin',
  name: 'memory_update',
  description: `Update an existing memory record. Pass fields to update directly. Use this when information becomes outdated or needs refinement.

Example: memory_update({ collection: "contacts", id: "abc123", email: "newemail@example.com", role: "senior engineer" })`,
  parameters: {
    type: 'object',
    properties: {
      collection: {
        type: 'string',
        description: 'Name of the memory collection',
      },
      id: {
        type: 'string',
        description: 'ID of the record to update',
      },
    },
    required: ['collection', 'id'],
  },
};

/**
 * Delete a record from memory
 */
export const MEMORY_DELETE_TOOL: BuiltinToolDefinition = {
  type: 'builtin',
  name: 'memory_delete',
  description: `Delete a memory record. Use this when information is no longer valid or was stored incorrectly.`,
  parameters: {
    type: 'object',
    properties: {
      collection: {
        type: 'string',
        description: 'Name of the memory collection',
      },
      id: {
        type: 'string',
        description: 'ID of the record to delete',
      },
    },
    required: ['collection', 'id'],
  },
};

/**
 * All memory tools
 */
export const MEMORY_TOOLS: BuiltinToolDefinition[] = [
  MEMORY_STORE_TOOL,
  MEMORY_SEARCH_TOOL,
  MEMORY_UPDATE_TOOL,
  MEMORY_DELETE_TOOL,
];

/**
 * Generate memory tools with collection information in descriptions
 */
export function generateMemoryToolsWithCollections(
  collections: Array<{
    name: string;
    description: string | null;
    fields: Array<{ name: string; type: string; required?: boolean; description?: string }>;
  }>
): BuiltinToolDefinition[] {
  const collectionList = collections.map((c) => c.name).join(', ');
  const collectionDocs = collections
    .map((col) => {
      const fieldDocs = col.fields
        .map((f) => `  - ${f.name}: ${f.type}${f.required ? ' (required)' : ''}`)
        .join('\n');
      return `${col.name}${col.description ? ` - ${col.description}` : ''}\n${fieldDocs}`;
    })
    .join('\n\n');

  return [
    {
      ...MEMORY_STORE_TOOL,
      description: `Save information to long-term memory. Pass schema fields directly.

Available collections: ${collectionList}

Schemas:
${collectionDocs}

Example: memory_store({ collection: "contacts", name: "Alice", email: "alice@example.com" })`,
      parameters: {
        ...MEMORY_STORE_TOOL.parameters,
        properties: {
          collection: {
            type: 'string',
            description: `Collection name: ${collectionList}`,
          },
        },
      },
    },
    {
      ...MEMORY_SEARCH_TOOL,
      description: `Search long-term memory for relevant information.

Available collections: ${collectionList}

Use before attempting a task to check for past experiences.

Example: memory_search({ collection: "contacts", filters: { role: "engineer" }, limit: 5 })`,
      parameters: {
        ...MEMORY_SEARCH_TOOL.parameters,
        properties: {
          ...MEMORY_SEARCH_TOOL.parameters.properties,
          collection: {
            type: 'string',
            description: `Collection name: ${collectionList}`,
          },
        },
      },
    },
    {
      ...MEMORY_UPDATE_TOOL,
      description: `Update an existing memory record. Pass fields to update directly.

Available collections: ${collectionList}

Example: memory_update({ collection: "contacts", id: "abc123", email: "newemail@example.com" })`,
      parameters: {
        ...MEMORY_UPDATE_TOOL.parameters,
        properties: {
          collection: {
            type: 'string',
            description: `Collection name: ${collectionList}`,
          },
          id: {
            type: 'string',
            description: 'ID of the record to update',
          },
        },
      },
    },
    {
      ...MEMORY_DELETE_TOOL,
      description: `Delete a memory record.

Available collections: ${collectionList}

Use when information is no longer valid.`,
      parameters: {
        ...MEMORY_DELETE_TOOL.parameters,
        properties: {
          ...MEMORY_DELETE_TOOL.parameters.properties,
          collection: {
            type: 'string',
            description: `Collection name: ${collectionList}`,
          },
        },
      },
    },
  ];
}
