import type { NodeDefinitionRaw } from './definition.types.js';

export const HTTP_NODE_DEFINITION: NodeDefinitionRaw = {
  type: 'http',
  description: 'HTTP request node. Makes external API calls. Partial SSE support: auto-extracts fields that downstream nodes expect.',
  statusText: 'Fetching...',
  inputs: ['body', 'params'],
  outputs: ['response', 'status', 'error'],
  options: [
    {
      name: 'method',
      type: 'enum',
      description: 'HTTP method.',
      values: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      default: 'GET',
    },
    {
      name: 'url',
      type: 'string',
      required: true,
      description: 'Request URL. Supports {{node:id.path}} template syntax.',
    },
    {
      name: 'headers',
      type: 'object',
      description: 'Request headers. Values support {{node:id.path}} template syntax.',
    },
    {
      name: 'body',
      type: 'object',
      description: 'Request body for POST/PUT/PATCH. Supports {{node:id.path}} in strings.',
    },
    {
      name: 'timeout',
      type: 'number',
      description: 'Request timeout in milliseconds.',
      default: 30000,
    },
    {
      name: 'continueOnError',
      type: 'boolean',
      description: 'If true, errors are returned in the error output instead of throwing. Allows workflow to continue on HTTP failures.',
      default: false,
    },
    {
      name: 'persistedFields',
      type: 'enum[]',
      description: 'Fields to persist in run state for debugging. Empty by default. WARNING: headers/body may expose secrets.',
      values: ['url', 'method', 'headers', 'body', 'status', 'responseHeaders', 'sseEvents'],
    },
  ],
  features: [
    'Template interpolation with {{node:id.path}} syntax',
    'SSE (Server-Sent Events) streaming support',
    'Automatic event accumulation with deep merge',
    'Early termination when required paths are found',
    'Supports both standard SSE (data: prefix) and raw JSON lines',
    'continueOnError: capture errors in output instead of failing workflow',
  ],
  examples: [
    {
      name: 'GET request',
      description: 'Simple GET request',
      id: 'http-1',
      type: 'http',
      data: {
        method: 'GET',
        url: 'https://api.example.com/data/{{node:input.id}}',
      },
    },
    {
      name: 'POST with body',
      description: 'POST request with JSON body',
      id: 'http-2',
      type: 'http',
      data: {
        method: 'POST',
        url: 'https://api.example.com/items',
        headers: { 'Content-Type': 'application/json' },
        body: { name: '{{node:input.name}}', value: '{{node:input.value}}' },
      },
    },
    {
      name: 'Continue on error',
      description: 'Request that continues workflow even on failure. Error available in {{node:http-3.error}}',
      id: 'http-3',
      type: 'http',
      data: {
        method: 'GET',
        url: 'https://api.example.com/data',
        continueOnError: true,
      },
    },
  ],
};
