import type { NodeDefinitionRaw } from './definition.types.js';

export const OUTPUT_NODE_DEFINITION: NodeDefinitionRaw = {
  type: 'output',
  description: 'Workflow exit point. Define output fields directly in data object.',
  statusText: 'Preparing output...',
  inputs: ['*'],
  outputs: [],
  options: [],
  features: [
    'Each field in data becomes an output field',
    'Field values support {{node:id.path}} template syntax',
    'Multiple output nodes can be used to define separate output fields',
    'Base64 files (images, PDFs) are automatically extracted and saved',
    'Saved files are replaced with {{inner:fileId}} references',
  ],
  examples: [
    {
      name: 'Single output field',
      description: 'Output a single field from an LLM node',
      id: 'output',
      type: 'output',
      data: {
        response: '{{node:llm-1.response}}',
      },
    },
    {
      name: 'Multiple output fields',
      description: 'Output multiple fields from different nodes',
      id: 'output',
      type: 'output',
      data: {
        summary: '{{node:llm-1.response}}',
        score: '{{node:llm-2.response}}',
        status: '{{node:http-1.status}}',
      },
    },
    {
      name: 'Nested path access',
      description: 'Access nested fields from node outputs',
      id: 'output',
      type: 'output',
      data: {
        screenshot: '{{node:http-1.response.screenshots.screenshot}}',
        error: '{{node:http-1.response.error}}',
      },
    },
    {
      name: 'File handling',
      description: 'Base64 images/files are auto-extracted and saved. Output contains {{inner:fileId}} refs.',
      id: 'output',
      type: 'output',
      data: {
        result: '{{node:llm-1.response}}',
        screenshot: '{{node:http-1.response.screenshot}}',
      },
    },
  ],
};
