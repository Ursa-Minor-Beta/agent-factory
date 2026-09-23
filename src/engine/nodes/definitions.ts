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
    type: 'if-else',
    description: 'Conditional branching node. Routes data based on expression evaluation.',
    inputs: ['input'],
    outputs: ['true', 'false', 'result'],
    options: [
      {
        name: 'expression',
        type: 'string',
        required: true,
        description: 'JavaScript expression to evaluate. Access input via `input` variable.',
      },
    ],
    examples: [
      {
        name: 'Check value',
        description: 'Branch based on value',
        data: {
          expression: 'input.score >= 80',
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
