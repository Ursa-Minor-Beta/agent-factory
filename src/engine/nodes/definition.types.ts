/**
 * Node type definitions with metadata for documentation and tooling
 */

/**
 * Valid node types in the workflow engine
 */
export const NODE_TYPES = [
  'input',
  'output',
  'llm',
  'http',
  'js',
  'agent',
  'branch',
  'memory-store',
  'memory-search',
  'memory-update',
  'memory-delete',
] as const;
export type NodeType = (typeof NODE_TYPES)[number];

/**
 * Valid node option types:
 * - string: Short text input (single line, e.g., URLs, names, model names)
 * - text: Long text input (multiline, e.g., prompts, descriptions, paragraphs)
 * - code: Code input (multiline with syntax highlighting, e.g., JavaScript, JSON templates)
 * - number: Numeric input (integers or floats)
 * - boolean: True/false checkbox
 * - object: JSON object or array
 * - enum: Single selection from predefined values
 * - enum[]: Multiple selections from predefined values
 * - node[]: Multiple ids of other nodes in the same workflow
 */
export const NODE_OPTION_TYPES = [
  'string',
  'text',
  'code',
  'number',
  'boolean',
  'object',
  'enum',
  'enum[]',
  'node[]'
] as const;
export type NodeOptionType = (typeof NODE_OPTION_TYPES)[number];

export interface NodeOption {
  name: string;
  type: NodeOptionType;
  required?: boolean;
  description: string;
  values?: string[]; // For enum type
  default?: unknown;
}

export interface NodeExample {
  name: string;
  description: string;
  id: string;
  type: NodeType;
  data: Record<string, unknown>;
  runAfter?: string[];
}

/**
 * Fields set on the node itself (next to id/type), not inside `data`
 */
export const COMMON_NODE_FIELDS: NodeOption[] = [
  {
    name: 'runAfter',
    type: 'node[]',
    description: 'Ordering-only dependencies: ids of nodes that must finish (or be skipped) before this node runs. No data is passed; use {{node:id.path}} for that.',
  },
];

export interface NodeDefinitionRaw {
  type: NodeType;
  description: string;
  /** Human-readable status text shown during node execution (e.g., "Thinking...") */
  statusText: string;
  inputs: string[];
  outputs: string[];
  options: NodeOption[];
  /** Node-level fields (outside `data`). Filled from COMMON_NODE_FIELDS by the registry when omitted */
  nodeFields?: NodeOption[];
  features?: string[];
  examples?: NodeExample[];
}

export type NodeDefinition = Omit<NodeDefinitionRaw, 'statusText'>;
