import type { NodeDefinitionRaw } from './definition.types.js';

export const INPUT_NODE_DEFINITION: NodeDefinitionRaw = {
  type: 'input',
  description: 'Workflow entry point. Defines the input schema for the workflow.',
  statusText: 'Processing input...',
  inputs: [],
  outputs: ['*'],
  options: [
    {
      name: 'schema',
      type: 'object',
      required: true,
      description:
        'Input field definitions. Keys are field names, values define type (string, number, boolean, enum), required, and default. Enum fields also define options (string[]) and are shown as a dropdown.',
    },
  ],
  examples: [
    {
      name: 'Text input',
      description: 'Simple text input field',
      id: 'input',
      type: 'input',
      data: {
        schema: {
          text: { type: 'string', required: true },
        },
      },
    },
    {
      name: 'Multiple fields with defaults',
      description: 'Input with multiple fields including default values',
      id: 'input-2',
      type: 'input',
      data: {
        schema: {
          query: { type: 'string', required: true },
          maxResults: { type: 'number', required: false, default: 10 },
          includeMetadata: { type: 'boolean', required: false, default: false },
        },
      },
    },
    {
      name: 'Predefined requests (enum)',
      description: 'Dropdown of predefined values for simple agents',
      id: 'input-3',
      type: 'input',
      data: {
        schema: {
          request: { type: 'enum', options: ['Summarize today', 'List open tasks', 'Weekly report'], required: true },
        },
      },
    },
  ],
};
