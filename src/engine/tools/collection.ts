/**
 * Collection management tools for the Collection Creator
 */

import type { BuiltinToolDefinition } from './types.js';
import { MEMORY_FIELD_TYPES, MEMORY_FIELD_OPTIONS } from '../../domain/entities/Memory.js';

const FIELD_TYPES_LIST = MEMORY_FIELD_TYPES.join(', ');
const FIELD_TYPES_ENUM = MEMORY_FIELD_TYPES.map((t) => `"${t}"`).join('|');

// Generate field schema description from MEMORY_FIELD_OPTIONS
const FIELD_SCHEMA_DESC = `{ ${MEMORY_FIELD_OPTIONS.map(
  (opt) => `${opt.name}${opt.required ? '' : '?'}: ${opt.type === 'MemoryFieldType' ? FIELD_TYPES_ENUM : opt.type}`
).join(', ')} }`;

export const CREATE_COLLECTION_TOOL: BuiltinToolDefinition = {
  type: 'builtin',
  name: 'create_collection',
  description: `Create a new memory collection with a custom schema.

Field types: ${FIELD_TYPES_LIST}

Example:
{
  "name": "user_preferences",
  "description": "Stores user preferences and settings",
  "fields": [
    { "name": "userId", "type": "string", "required": true, "index": true },
    { "name": "theme", "type": "string", "default": "light" },
    { "name": "notifications", "type": "boolean", "default": true },
    { "name": "tags", "type": "array", "items": "string" }
  ]
}`,
  parameters: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Unique name for the collection (required)',
      },
      description: {
        type: 'string',
        description: 'Description of what this collection stores',
      },
      fields: {
        type: 'array',
        description: `Array of field definitions. Each field: ${FIELD_SCHEMA_DESC}`,
      },
    },
    required: ['name', 'fields'],
  },
};

export const GET_COLLECTION_TOOL: BuiltinToolDefinition = {
  type: 'builtin',
  name: 'get_collection',
  description: 'Get a collection schema by name to view its current definition.',
  parameters: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Name of the collection to retrieve',
      },
    },
    required: ['name'],
  },
};

export const UPDATE_COLLECTION_TOOL: BuiltinToolDefinition = {
  type: 'builtin',
  name: 'update_collection',
  description: `Update an existing collection's schema. You can change the name, description, or fields.

WARNING: Changing field types or removing fields may affect existing records.`,
  parameters: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Current name of the collection to update',
      },
      newName: {
        type: 'string',
        description: 'New name for the collection (optional)',
      },
      description: {
        type: 'string',
        description: 'New description (optional)',
      },
      fields: {
        type: 'array',
        description: 'New field definitions (optional, replaces all fields)',
      },
    },
    required: ['name'],
  },
};

export const LIST_COLLECTIONS_TOOL: BuiltinToolDefinition = {
  type: 'builtin',
  name: 'list_collections',
  description: 'List all memory collections for the current user.',
  parameters: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Maximum number of collections to return (default: 50)',
      },
    },
  },
};

export const DELETE_COLLECTION_TOOL: BuiltinToolDefinition = {
  type: 'builtin',
  name: 'delete_collection',
  description: 'Delete a collection and ALL its records. This action cannot be undone.',
  parameters: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Name of the collection to delete',
      },
    },
    required: ['name'],
  },
};

export const COLLECTION_TOOLS = [
  CREATE_COLLECTION_TOOL,
  GET_COLLECTION_TOOL,
  UPDATE_COLLECTION_TOOL,
  LIST_COLLECTIONS_TOOL,
  DELETE_COLLECTION_TOOL,
];
