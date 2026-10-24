import { config } from '../../config/index.js';
import type { NodeDefinitionRaw } from './definition.types.js';
import { JS_NODE_AVAILABLE_GLOBALS } from './js.js';

export const JS_NODE_DEFINITION: NodeDefinitionRaw = {
  type: 'js',
  description: 'JavaScript transform node. Executes custom code in a sandboxed environment with memory/timeout limits.',
  statusText: 'Executing code...',
  inputs: ['input'],
  outputs: ['output'],
  options: [
    {
      name: 'input',
      type: 'string',
      description: 'Template for input value. Supports {{node:id.path}} syntax.',
    },
    {
      name: 'code',
      type: 'code',
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
    {
      name: 'persistedFields',
      type: 'enum[]',
      description: 'Fields to persist in run state for debugging. Empty by default.',
      values: ['input'],
    },
  ],
  features: [
    'Sandboxed execution (no require, fs, process access)',
    'Memory and timeout limits enforced',
    `Available globals: ${JS_NODE_AVAILABLE_GLOBALS.join(', ')}`,
  ],
  examples: [
    {
      name: 'Single input',
      description: 'Transform a single value from another node',
      id: 'js-1',
      type: 'js',
      data: {
        input: '{{node:llm-1.response}}',
        code: 'output = { result: input.toUpperCase() };',
      },
    },
    {
      name: 'Multi input array',
      description: 'Combine values from multiple nodes as an array',
      id: 'js-4',
      type: 'js',
      data: {
        input: ['{{node:llm-1.response}}', '{{node:llm-2.response}}'],
        code: 'output = { resultA: input[0].toUpperCase(), resultB: input[1].toUpperCase() };',
      },
    },
    {
      name: 'Multi input object',
      description: 'Combine values from multiple nodes as an object',
      id: 'js-5',
      type: 'js',
      data: {
        input: { a: '{{node:llm-1.response}}', b: '{{node:llm-2.response}}' },
        code: 'output = { resultA: input.a.toUpperCase(), resultB: input.b.toUpperCase() };',
      },
    },
    {
      name: 'Parse JSON',
      description: 'Parse JSON string from LLM response',
      id: 'js-2',
      type: 'js',
      data: {
        input: '{{node:llm-1.response}}',
        code: 'output = JSON.parse(input);',
      },
    },
    {
      name: 'With custom limits',
      description: 'Process data array with custom timeout and memory',
      id: 'js-3',
      type: 'js',
      data: {
        input: '{{node:http-1.response.data}}',
        code: 'output = input.map(x => x * 2);',
        timeout: 10000,
        memoryMb: 128,
      },
    },
  ],
};
