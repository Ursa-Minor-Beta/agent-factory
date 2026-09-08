import { FastifyInstance } from 'fastify';

interface NodeOption {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'enum';
  required?: boolean;
  description: string;
  values?: string[]; // For enum type
  default?: unknown;
}

interface NodeExample {
  name: string;
  description: string;
  data: Record<string, unknown>;
}

interface NodeDefinition {
  type: string;
  description: string;
  inputs: string[];
  outputs: string[];
  options: NodeOption[];
  features?: string[];
  examples?: NodeExample[];
}

// Node type definitions with metadata
const NODE_DEFINITIONS: NodeDefinition[] = [
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
      {
        name: 'Named output',
        description: 'Output with custom key name',
        data: {
          name: 'result',
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
    ],
    features: ['Template interpolation with {{variable}} syntax'],
    examples: [
      {
        name: 'Simple chat',
        description: 'Basic OpenAI chat completion',
        data: {
          provider: 'openai',
          model: 'gpt-4o-mini',
          userPrompt: '{{text}}',
        },
      },
      {
        name: 'With system prompt',
        description: 'Chat with a system prompt for context',
        data: {
          provider: 'openai',
          model: 'gpt-4o-mini',
          systemPrompt: 'You are a helpful assistant that responds concisely.',
          userPrompt: '{{text}}',
          temperature: 0.5,
          maxTokens: 500,
        },
      },
      {
        name: 'Anthropic Claude',
        description: 'Using Anthropic Claude model',
        data: {
          provider: 'anthropic',
          model: 'claude-sonnet-4-20250514',
          systemPrompt: 'You are an expert code reviewer.',
          userPrompt: 'Review this code:\n{{code}}',
        },
      },
      {
        name: 'Local Ollama',
        description: 'Using local Ollama instance',
        data: {
          provider: 'ollama',
          model: 'llama3.2',
          userPrompt: '{{text}}',
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
        description: 'Simple GET request with URL parameter',
        data: {
          method: 'GET',
          url: 'https://api.example.com/users/{{userId}}',
        },
      },
      {
        name: 'POST with JSON body',
        description: 'POST request with JSON body and auth header',
        data: {
          method: 'POST',
          url: 'https://api.example.com/messages',
          headers: {
            Authorization: 'Bearer {{apiKey}}',
          },
          body: {
            message: '{{text}}',
            channel: 'general',
          },
        },
      },
      {
        name: 'With timeout',
        description: 'Request with custom timeout',
        data: {
          method: 'GET',
          url: 'https://slow-api.example.com/data',
          timeout: 60000,
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
        name: 'Pass through',
        description: 'Simply return the input unchanged',
        data: {
          code: 'return input;',
        },
      },
      {
        name: 'Extract field',
        description: 'Extract a specific field from input',
        data: {
          code: 'return input.response;',
        },
      },
      {
        name: 'Transform data',
        description: 'Transform and combine data',
        data: {
          code: `const items = input.items || [];
return {
  count: items.length,
  names: items.map(i => i.name),
  total: items.reduce((sum, i) => sum + i.value, 0)
};`,
        },
      },
      {
        name: 'Parse JSON string',
        description: 'Parse a JSON string from LLM response',
        data: {
          code: `try {
  return JSON.parse(input);
} catch (e) {
  return { error: 'Invalid JSON', raw: input };
}`,
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
        description: 'Execute another agent with the current input',
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
        name: 'Check boolean',
        description: 'Branch based on a boolean field',
        data: {
          expression: 'input.isValid === true',
        },
      },
      {
        name: 'Check length',
        description: 'Branch based on array length',
        data: {
          expression: 'input.items && input.items.length > 0',
        },
      },
      {
        name: 'Check value range',
        description: 'Branch based on numeric value',
        data: {
          expression: 'input.score >= 80',
        },
      },
      {
        name: 'Check string content',
        description: 'Branch based on string matching',
        data: {
          expression: 'input.status === "approved" || input.status === "pending"',
        },
      },
    ],
  },
];

const optionSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    type: { type: 'string', enum: ['string', 'number', 'boolean', 'object', 'enum'] },
    required: { type: 'boolean' },
    description: { type: 'string' },
    values: { type: 'array', items: { type: 'string' } },
    default: {},
  },
};

const exampleSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    description: { type: 'string' },
    data: { type: 'object', additionalProperties: true },
  },
};

const nodeSchema = {
  type: 'object',
  properties: {
    type: { type: 'string' },
    description: { type: 'string' },
    inputs: { type: 'array', items: { type: 'string' } },
    outputs: { type: 'array', items: { type: 'string' } },
    options: { type: 'array', items: optionSchema },
    features: { type: 'array', items: { type: 'string' } },
    examples: { type: 'array', items: exampleSchema },
  },
};

export async function nodeRoutes(app: FastifyInstance) {
  // List available node types
  app.get('/api/nodes', {
    schema: {
      tags: ['nodes'],
      summary: 'List available node types with their configuration options',
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'array', items: nodeSchema },
          },
        },
      },
    },
  }, async () => ({
    success: true,
    data: NODE_DEFINITIONS,
  }));
}
