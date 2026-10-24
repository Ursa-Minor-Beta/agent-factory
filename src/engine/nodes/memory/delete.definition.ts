import type { NodeDefinitionRaw } from '../definition.types.js';

export const MEMORY_DELETE_NODE_DEFINITION: NodeDefinitionRaw = {
  type: 'memory-delete',
  description: 'Delete a memory record. Use when information is no longer valid.',
  statusText: 'Deleting from memory...',
  inputs: ['trigger'],
  outputs: ['success', 'deleted'],
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
      description: 'ID of the record to delete. Supports {{node:id.path}} syntax.',
    },
  ],
  examples: [
    {
      name: 'Delete record',
      description: 'Delete a specific record',
      id: 'memory-delete-1',
      type: 'memory-delete',
      data: {
        collection: 'learned_steps',
        id: '{{node:input.recordId}}',
      },
    },
  ],
};
