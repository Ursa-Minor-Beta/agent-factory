import { config } from '../../config/index.js';
import { JS_NODE_AVAILABLE_GLOBALS } from './js.js';

/**
 * Node type definitions with metadata for documentation and tooling
 */

export interface NodeOption {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'enum';
  required?: boolean;
  description: string;
  values?: string[]; // For enum type
  default?: unknown;
}

export interface NodeExample {
  name: string;
  description: string;
  data: Record<string, unknown>;
}

export interface NodeDefinition {
  type: string;
  description: string;
  inputs: string[];
  outputs: string[];
  options: NodeOption[];
  features?: string[];
  examples?: NodeExample[];
}

export const NODE_DEFINITIONS: NodeDefinition[] = [
  {
    type: 'input',
    description: 'Workflow entry point. Defines the input schema for the workflow.',
    inputs: [],
    outputs: ['*'],
    options: [
      {
        name: 'schema',
        type: 'object',
        required: true,
        description: 'Input field definitions. Keys are field names, values define type, required, and default.',
      },
    ],
    examples: [
      {
        name: 'Text input',
        description: 'Simple text input field',
        data: {
          schema: {
            text: { type: 'string', required: true },
          },
        },
      },
      {
        name: 'Multiple fields with defaults',
        description: 'Input with multiple fields including default values',
        data: {
          schema: {
            query: { type: 'string', required: true },
            maxResults: { type: 'number', required: false, default: 10 },
            includeMetadata: { type: 'boolean', required: false, default: false },
          },
        },
      },
    ],
  },
  {
    type: 'output',
    description: 'Workflow exit point. Define output fields directly in data object.',
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
        data: {
          response: '{{node:llm-1.response}}',
        },
      },
      {
        name: 'Multiple output fields',
        description: 'Output multiple fields from different nodes',
        data: {
          summary: '{{node:llm-1.response}}',
          score: '{{node:llm-2.response}}',
          status: '{{node:http-1.status}}',
        },
      },
      {
        name: 'Nested path access',
        description: 'Access nested fields from node outputs',
        data: {
          screenshot: '{{node:http-1.response.screenshots.screenshot}}',
          error: '{{node:http-1.response.error}}',
        },
      },
      {
        name: 'File handling',
        description: 'Base64 images/files are auto-extracted and saved. Output contains {{inner:fileId}} refs.',
        data: {
          result: '{{node:llm-1.response}}',
          screenshot: '{{node:http-1.response.screenshot}}',
        },
      },
    ],
  },
  {
    type: 'llm',
    description: 'LLM call node. Sends prompts to OpenAI, Anthropic, or Ollama.',
    inputs: ['prompt', 'context'],
    outputs: ['response', 'usage'],
    options: [
      {
        name: 'provider',
        type: 'enum',
        required: true,
        description: 'LLM provider to use.',
        values: ['openai', 'anthropic', 'ollama'],
      },
      {
        name: 'model',
        type: 'string',
        required: true,
        description: 'Model name (e.g., gpt-4o-mini, claude-sonnet-4-20250514, llama3.2).',
      },
      {
        name: 'systemPrompt',
        type: 'string',
        description: 'System prompt. Supports {{node:id.path}} template syntax.',
      },
      {
        name: 'userPrompt',
        type: 'string',
        description: 'User prompt. Supports {{node:id.path}} template syntax.',
      },
      {
        name: 'temperature',
        type: 'number',
        description: 'Sampling temperature (0-2).',
        default: 0.7,
      },
      {
        name: 'maxTokens',
        type: 'number',
        description: 'Maximum tokens in response.',
        default: 1000,
      },
      {
        name: 'maxMessages',
        type: 'number',
        description: 'Maximum conversation history messages to include.',
        default: 0,
      },
      {
        name: 'tools',
        type: 'object',
        description: 'Array of tool definitions for function calling.',
      },
    ],
    features: [
      'Template interpolation with {{node:id.path}} syntax',
    ],
    examples: [
      {
        name: 'Simple chat',
        description: 'Basic OpenAI chat completion',
        data: {
          provider: 'openai',
          model: 'gpt-4o-mini',
          systemPrompt: 'You are a helpful assistant.',
          userPrompt: '{{node:input-1.text}}',
          temperature: 0.7,
          maxTokens: 1000,
        },
      },
    ],
  },
  {
    type: 'http',
    description: 'HTTP request node. Makes external API calls. Partial SSE support: auto-extracts fields that downstream nodes expect.',
    inputs: ['body', 'params'],
    outputs: ['response', 'status'],
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
        name: 'persistedFields',
        type: 'enum',
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
    ],
    examples: [
      {
        name: 'GET request',
        description: 'Simple GET request',
        data: {
          method: 'GET',
          url: 'https://api.example.com/data/{{node:input-1.id}}',
        },
      },
      {
        name: 'POST with body',
        description: 'POST request with JSON body',
        data: {
          method: 'POST',
          url: 'https://api.example.com/items',
          headers: { 'Content-Type': 'application/json' },
          body: { name: '{{node:input-1.name}}', value: '{{node:input-1.value}}' },
        },
      }
    ],
  },
  {
    type: 'js',
    description: 'JavaScript transform node. Executes custom code in a sandboxed environment with memory/timeout limits.',
    inputs: ['input'],
    outputs: ['output'],
    options: [
      {
        name: 'code',
        type: 'string',
        required: true,
        description: 'JavaScript code. Receives `input` variable, assign result to `output` or use return.',
      },
      {
        name: 'timeout',
        type: 'number',
        description: `Execution timeout in milliseconds (max: ${config.jsNode.maxTimeoutMs}).`,
        default: config.jsNode.defaultTimeoutMs,
      },
      {
        name: 'memoryMb',
        type: 'number',
        description: `Memory limit in megabytes (max: ${config.jsNode.maxMemoryMb}).`,
        default: config.jsNode.defaultMemoryMb,
      },
    ],
    features: [
      'Sandboxed execution (no require, fs, process access)',
      'Memory and timeout limits enforced',
      `Available globals: ${JS_NODE_AVAILABLE_GLOBALS.join(', ')}`,
    ],
    examples: [
      {
        name: 'Transform data',
        description: 'Transform input data',
        data: {
          code: 'output = { result: input.text.toUpperCase() };',
        },
      },
      {
        name: 'Parse JSON',
        description: 'Parse JSON string',
        data: {
          code: 'output = JSON.parse(input.response);',
        },
      },
      {
        name: 'With custom limits',
        description: 'Custom timeout and memory',
        data: {
          code: 'output = input.data.map(x => x * 2);',
          timeout: 10000,
          memoryMb: 128,
        },
      },
    ],
  },
  {
    type: 'agent',
    description: 'Sub-agent node. Executes another agent as part of the workflow.',
    inputs: ['input'],
    outputs: ['output'],
    options: [
      {
        name: 'agentId',
        type: 'string',
        required: true,
        description: 'ID of the agent to execute.',
      },
    ],
    examples: [
      {
        name: 'Call sub-agent',
        description: 'Execute another agent',
        data: {
          agentId: '507f1f77bcf86cd799439011',
        },
      },
    ],
  },
  {
    type: 'branch',
    description: 'Multi-way conditional branching with execution control. Only nodes in the active branch execute.',
    inputs: ['input'],
    outputs: ['activeBranch', '*'],
    options: [
      {
        name: 'input',
        type: 'string',
        description: 'Template for input value to evaluate. Supports {{node:id.path}} syntax.',
      },
      {
        name: 'branches',
        type: 'object',
        required: true,
        description: 'Array of branch definitions. Each has: name (string), condition (expression), nodes (array of node IDs to execute if active).',
      },
    ],
    features: [
      'Evaluates branches in order, activates first matching condition',
      'Only nodes in active branch execute - others are skipped',
      'Nodes not listed in any branch always execute',
      'Each branch outputs input value if active, null if inactive',
      'Outputs activeBranch name for reference',
    ],
    examples: [
      {
        name: 'Score evaluation',
        description: 'Execute different LLM nodes based on score',
        data: {
          input: '{{node:input-1.score}}',
          branches: [
            {
              name: 'high',
              condition: 'input >= 90',
              nodes: ['llm-high', 'format-high'],
            },
            {
              name: 'pass',
              condition: 'input >= 60',
              nodes: ['llm-pass', 'format-pass'],
            },
            {
              name: 'fail',
              condition: 'true',
              nodes: ['llm-fail', 'format-fail'],
            },
          ],
        },
      },
      {
        name: 'Status routing',
        description: 'Route API responses by status code',
        data: {
          input: '{{node:http-1.response}}',
          branches: [
            {
              name: 'success',
              condition: 'input.status >= 200 && input.status < 300',
              nodes: ['process-success'],
            },
            {
              name: 'error',
              condition: 'true',
              nodes: ['handle-error', 'log-error'],
            },
          ],
        },
      },
    ],
  },
  {
    type: 'memory-store',
    description: 'Save data to a memory collection. Use to persist learned patterns, successful actions, or important facts.',
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
      {
        name: 'importance',
        type: 'number',
        description: 'Importance score (0-1) for retrieval prioritization.',
        default: 0.5,
      },
      {
        name: 'tags',
        type: 'object',
        description: 'Array of tags for categorization.',
      },
    ],
    examples: [
      {
        name: 'Store learned step',
        description: 'Save a successful test action',
        data: {
          collection: 'learned_steps',
          data: {
            page: '{{node:input-1.url}}',
            action: 'click',
            selector: '#play-btn',
            success: true,
          },
          importance: 0.8,
        },
      },
    ],
  },
  {
    type: 'memory-search',
    description: 'Search records in a memory collection. Use to retrieve relevant past experiences before taking action.',
    inputs: ['trigger'],
    outputs: ['results', 'scores', 'count'],
    options: [
      {
        name: 'collection',
        type: 'string',
        required: true,
        description: 'Name of the memory collection.',
      },
      {
        name: 'query',
        type: 'string',
        description: 'Semantic search query.',
      },
      {
        name: 'filters',
        type: 'object',
        description: 'Filter by field values. Supports {{node:id.path}} syntax.',
      },
      {
        name: 'tags',
        type: 'object',
        description: 'Filter by tags.',
      },
      {
        name: 'minImportance',
        type: 'number',
        description: 'Minimum importance score (0-1).',
      },
      {
        name: 'limit',
        type: 'number',
        description: 'Maximum results to return.',
        default: 10,
      },
    ],
    examples: [
      {
        name: 'Search by page',
        description: 'Find memories for a specific page',
        data: {
          collection: 'learned_steps',
          filters: { page: '{{node:input-1.url}}' },
          limit: 5,
        },
      },
    ],
  },
  {
    type: 'memory-update',
    description: 'Update an existing memory record. Use to refine or correct stored information.',
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
      {
        name: 'importance',
        type: 'number',
        description: 'Updated importance score (0-1).',
      },
      {
        name: 'tags',
        type: 'object',
        description: 'Updated tags.',
      },
    ],
    examples: [
      {
        name: 'Update success rate',
        description: 'Update a record from search results',
        data: {
          collection: 'learned_steps',
          id: '{{node:search-1.results.0.id}}',
          data: { success_rate: 0.95 },
        },
      },
    ],
  },
  {
    type: 'memory-delete',
    description: 'Delete a memory record. Use when information is no longer valid.',
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
        data: {
          collection: 'learned_steps',
          id: '{{node:input-1.recordId}}',
        },
      },
    ],
  },
];

/**
 * Generate a text description of all node types for LLM prompts
 */
export function generateNodeDocsForPrompt(): string {
  const lines: string[] = ['## Available Node Types\n'];

  for (const node of NODE_DEFINITIONS) {
    lines.push(`### ${node.type}`);
    lines.push(node.description);
    lines.push(`- Inputs: ${node.inputs.length ? node.inputs.join(', ') : 'none'}`);
    lines.push(`- Outputs: ${node.outputs.length ? node.outputs.join(', ') : 'none'}`);

    if (node.options.length) {
      lines.push('- Options:');
      for (const opt of node.options) {
        const req = opt.required ? ' (required)' : '';
        const def = opt.default !== undefined ? ` [default: ${JSON.stringify(opt.default)}]` : '';
        const vals = opt.values ? ` [values: ${opt.values.join('|')}]` : '';
        lines.push(`  - ${opt.name}: ${opt.description}${req}${def}${vals}`);
      }
    }

    const firstExample = node.examples?.[0];
    if (firstExample) {
      lines.push('- Example:');
      lines.push('```json');
      lines.push(JSON.stringify({
        id: `${node.type}-1`,
        type: node.type,
        data: firstExample.data,
      }, null, 2));
      lines.push('```');
    }

    lines.push('');
  }

  return lines.join('\n');
}
