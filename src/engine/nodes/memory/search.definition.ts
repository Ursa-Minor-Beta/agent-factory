import type { NodeDefinitionRaw } from '../definition.types.js';

export const MEMORY_SEARCH_NODE_DEFINITION: NodeDefinitionRaw = {
  type: 'memory-search',
  description: 'Search records in a memory collection. Use to retrieve relevant past experiences before taking action.',
  statusText: 'Searching memory...',
  inputs: ['trigger'],
  outputs: ['records', 'count'],
  options: [
    {
      name: 'collection',
      type: 'string',
      required: true,
      description: 'Name of the memory collection.',
    },
    {
      name: 'filters',
      type: 'object',
      description: 'Filter by field values. Supports {{node:id.path}} syntax.',
    },
    {
      name: 'sort',
      type: 'object',
      description: 'Sort by field. Format: { field: string, direction: "asc" | "desc" }.',
    },
    {
      name: 'limit',
      type: 'number',
      description: 'Maximum results to return.',
      default: 10,
    },
    {
      name: 'offset',
      type: 'number',
      description: 'Number of records to skip for pagination.',
      default: 0,
    },
  ],
  examples: [
    {
      name: 'Search by page',
      description: 'Find memories for a specific page',
      id: 'memory-search-1',
      type: 'memory-search',
      data: {
        collection: 'learned_steps',
        filters: { page: '{{node:input.url}}' },
        limit: 5,
      },
    },
  ],
};
