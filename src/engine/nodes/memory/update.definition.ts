import type { NodeDefinitionRaw } from '../definition.types.js';

export const MEMORY_UPDATE_NODE_DEFINITION: NodeDefinitionRaw = {
  type: 'memory-update',
  description: 'Update an existing memory record. Use to refine or correct stored information.',
  statusText: 'Updating memory...',
  inputs: ['data', 'trigger'],
  outputs: ['success', 'record'],
  options: [
    {
      name: 'collection',
      type: 'string',
      required: true,
      description: 'Name of the memory collection.',
    },
    {
      name: 'id',
      type: 'string',
      required: true,
      description: 'ID of the record to update. Supports {{node:id.path}} syntax.',
    },
    {
      name: 'data',
      type: 'object',
      description: 'Data to update (merged with existing).',
    },
  ],
  examples: [
    {
      name: 'Update success rate',
      description: 'Update a record from search results',
      id: 'memory-update-1',
      type: 'memory-update',
      data: {
        collection: 'learned_steps',
        id: '{{node:search-1.records.0.id}}',
        data: { success_rate: 0.95 },
      },
    },
  ],
};
