/**
 * Schema field type definitions for memory collections
 */
export const MEMORY_FIELD_TYPES = ['string', 'number', 'boolean', 'date', 'array', 'object'] as const;
export type MemoryFieldType = (typeof MEMORY_FIELD_TYPES)[number];

/**
 * Field option definitions - single source of truth for field schema
 */
export const MEMORY_FIELD_OPTIONS = [
  { name: 'name', type: 'string', required: true, description: 'Field name (use camelCase)' },
  { name: 'type', type: 'MemoryFieldType', required: true, description: 'One of: ' + MEMORY_FIELD_TYPES.join(', ') },
  { name: 'required', type: 'boolean', required: false, description: 'If true, records must include this field' },
  { name: 'index', type: 'boolean', required: false, description: 'If true, enables fast filtering on this field' },
  { name: 'description', type: 'string', required: false, description: 'Human-readable description' },
  { name: 'default', type: 'unknown', required: false, description: 'Default value if not provided' },
  { name: 'items', type: 'MemoryFieldType', required: false, description: 'For array type, specifies the item type' },
] as const;

/**
 * Generate field options documentation string
 */
export function generateFieldOptionsDoc(): string {
  return MEMORY_FIELD_OPTIONS.map(
    (opt) => `- **${opt.name}**${opt.required ? ' (required)' : ''}: ${opt.description}`
  ).join('\n');
}

/**
 * Definition of a single field in a memory schema
 */
export interface MemorySchemaField {
  name: string;
  type: MemoryFieldType;
  required?: boolean;
  index?: boolean;
  description?: string;
  default?: unknown;
  /** For array type - the type of array items */
  items?: MemoryFieldType;
}

/**
 * Memory Schema - defines structure of a memory collection
 */
export interface MemorySchema {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  fields: MemorySchemaField[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Reserved/system-managed fields in MemoryRecord
 * These cannot be overridden by user data
 */
type MemoryRecordReserved = {
  readonly id: string;
  readonly schemaId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

/**
 * Reserved field names - extracted from MemoryRecordReserved type
 * TypeScript enforces these match the type definition
 */
export const MEMORY_RESERVED_FIELDS: readonly (keyof MemoryRecordReserved)[] = [
  'id',
  'schemaId',
  'createdAt',
  'updatedAt',
] as const;

export type MemoryReservedField = typeof MEMORY_RESERVED_FIELDS[number];

/**
 * Memory Record - a single entry in a memory collection
 * User-defined schema fields are stored directly at the root level
 */
export type MemoryRecord = MemoryRecordReserved & {
  /** User-defined fields from the schema stored at root level */
  [key: string]: unknown;
};

/**
 * DTO for creating a new memory schema
 */
export interface CreateMemorySchemaDTO {
  userId: string;
  name: string;
  description?: string;
  fields: MemorySchemaField[];
}

/**
 * DTO for updating a memory schema
 */
export interface UpdateMemorySchemaDTO {
  name?: string;
  description?: string;
  fields?: MemorySchemaField[];
}

/**
 * DTO for creating a new memory record
 * Pass user-defined fields directly (will be validated against schema)
 */
export interface CreateMemoryRecordDTO {
  schemaId: string;
  /** User-defined fields matching the collection schema */
  [key: string]: unknown;
}

/**
 * DTO for updating a memory record
 * Pass updated user-defined fields (partial update supported)
 */
export interface UpdateMemoryRecordDTO {
  /** User-defined fields to update */
  [key: string]: unknown;
}

/**
 * Search options for memory records
 */
export interface MemorySearchOptions {
  schemaId: string;
  /** Filter by field values (matches schema fields) */
  filters?: Record<string, unknown>;
  /** Sort field and direction */
  sort?: { field: string; direction: 'asc' | 'desc' };
  limit?: number;
  offset?: number;
}

/**
 * Result of a memory search
 */
export interface MemorySearchResult {
  record: MemoryRecord;
}
