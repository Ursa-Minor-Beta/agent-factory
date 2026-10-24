import type { NodeDefinitionRaw } from '../definition.types.js';

export const MEMORY_STORE_NODE_DEFINITION: NodeDefinitionRaw = {
  type: 'memory-store',
  description: 'Save data to a memory collection. Use to persist learned patterns, successful actions, or important facts.',
  statusText: 'Saving to memory...',
  inputs: ['data', 'trigger'],
  outputs: ['success', 'id', 'record'],
  options: [
    {
      name: 'collection',
      type: 'string',
      required: true,
      description: 'Name of the memory collection.',
    },
    {
      name: 'data',
      type: 'object',
      required: true,
      description: 'Data to store. Must match collection schema. Supports {{node:id.path}} syntax.',
    },
  ],
  examples: [
    {
      name: 'Store learned step',
      description: 'Save a successful test action',
      id: 'memory-store-1',
      type: 'memory-store',
      data: {
        collection: 'learned_steps',
        data: {
          page: '{{node:input.url}}',
          action: 'click',
          selector: '#play-btn',
          success: true,
        },
      },
    },
  ],
};
