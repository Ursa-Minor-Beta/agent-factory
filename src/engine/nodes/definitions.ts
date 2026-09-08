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
        description: 'Input field definitions. Keys are field names, values define type and required.',
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
        name: 'Multiple fields',
        description: 'Input with multiple fields of different types',
        data: {
          schema: {
            query: { type: 'string', required: true },
            maxResults: { type: 'number', required: false },
            includeMetadata: { type: 'boolean', required: false },
          },
        },
      },
    ],
  },
  {
    type: 'output',
    description: 'Workflow exit point. Collects the final output value.',
    inputs: ['value'],
    outputs: [],
    options: [
      {
        name: 'name',
        type: 'string',
        description: 'Output key name in the result.',
        default: 'output',
      },
    ],
    examples: [
      {
        name: 'Default output',
        description: 'Output with default key name',
        data: {},
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
        description: 'System prompt. Supports {{variable}} template syntax.',
      },
      {
        name: 'userPrompt',
        type: 'string',
        description: 'User prompt. Supports {{variable}} template syntax.',
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
        name: 'tools',
        type: 'object',
        description: 'Array of tool definitions for function calling.',
      },
    ],
    features: ['Template interpolation with {{variable}} syntax'],
    examples: [
      {
        name: 'Simple chat',
        description: 'Basic OpenAI chat completion',
        data: {
          provider: 'openai',
          model: 'gpt-4o-mini',
          systemPrompt: 'You are a helpful assistant.',
          userPrompt: '{{text}}',
          temperature: 0.7,
          maxTokens: 1000,
        },
      },
    ],
  },
  {
    type: 'http',
    description: 'HTTP request node. Makes external API calls.',
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
        description: 'Request URL. Supports {{variable}} template syntax.',
      },
      {
        name: 'headers',
        type: 'object',
        description: 'Request headers. Values support {{variable}} template syntax.',
      },
      {
        name: 'body',
        type: 'object',
        description: 'Request body for POST/PUT/PATCH. Supports {{variable}} in strings.',
      },
      {
        name: 'timeout',
        type: 'number',
        description: 'Request timeout in milliseconds.',
        default: 30000,
      },
    ],
    features: ['Template interpolation with {{variable}} syntax'],
    examples: [
      {
        name: 'GET request',
        description: 'Simple GET request',
        data: {
          method: 'GET',
          url: 'https://api.example.com/data/{{id}}',
        },
      },
      {
        name: 'POST with body',
        description: 'POST request with JSON body',
        data: {
          method: 'POST',
          url: 'https://api.example.com/items',
          headers: { 'Content-Type': 'application/json' },
          body: { name: '{{name}}', value: '{{value}}' },
        },
      },
    ],
  },
  {
    type: 'js',
    description: 'JavaScript transform node. Executes custom code to transform data.',
    inputs: ['input'],
    outputs: ['output'],
    options: [
      {
        name: 'code',
        type: 'string',
        required: true,
        description: 'JavaScript code. Receives `input` variable, should return output.',
      },
    ],
    examples: [
      {
        name: 'Transform data',
        description: 'Transform input data',
        data: {
          code: 'return { result: input.text.toUpperCase() };',
        },
      },
      {
        name: 'Parse JSON',
        description: 'Parse JSON string',
        data: {
          code: 'return JSON.parse(input.response);',
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
        position: { x: 400, y: 200 },
        data: firstExample.data,
      }, null, 2));
      lines.push('```');
    }

    lines.push('');
  }

  return lines.join('\n');
}
