/**
 * Full Test Agent: Tests multiple node types
 * - input, output, js: no dependencies
 * - http: uses httpbin.org (public test API)
 * - llm: requires configured provider
 * Uses template-based data flow with {{node:id.path}} syntax
 */

import type { WorkflowNode } from '../../domain/entities/Agent.js';

export const FULL_TEST_NODES: WorkflowNode[] = [
  {
    id: 'input-1',
    type: 'input',
    data: {
      schema: {
        text: { type: 'string', required: true, default: 'Test message' },
      },
    },
  },
  {
    id: 'http-1',
    type: 'http',
    data: {
      method: 'POST',
      url: 'https://httpbin.org/post',
      headers: { 'Content-Type': 'application/json' },
      body: '{"text": "{{node:input-1.text}}", "timestamp": "{{node:js-prepare.output.timestamp}}"}',
    },
  },
  {
    id: 'js-prepare',
    type: 'js',
    data: {
      code: `
return {
  text: input.text || '',
  timestamp: new Date().toISOString()
};
      `.trim(),
    },
  },
  {
    id: 'llm-1',
    type: 'llm',
    data: {
      provider: 'openai',
      model: 'gpt-4o-mini',
      systemPrompt: 'You are a helpful assistant. Be very brief.',
      userPrompt: 'Summarize this in one word: {{node:http-1.response.json.text}}',
      temperature: 0,
      maxTokens: 10,
    },
  },
  {
    id: 'js-format',
    type: 'js',
    data: {
      input: '{{node:llm-1.response}}',
      code: `
return {
  llmResponse: input,
  timestamp: new Date().toISOString()
};
      `.trim(),
    },
  },
  {
    id: 'output-1',
    type: 'output',
    data: {
      value: '{{node:js-format.output}}',
    },
  },
];

export const FULL_TEST_AGENT = {
  name: 'Test Agent (Full)',
  description: 'Tests http, js, llm, output nodes - http uses httpbin.org, llm requires provider config',
  nodes: FULL_TEST_NODES,
};
