
/**
 * Full Test Agent: Tests all node types
 * - input, output, js, if-else: no dependencies
 * - http: uses httpbin.org (public test API)
 * - llm: requires configured provider
 * - agent: references Basic Test Agent (set agentId after creation)
 */

import { WorkflowNode, WorkflowEdge } from "../../domain/entities/Agent.js";

export const FULL_TEST_NODES: WorkflowNode[] = [
  {
    id: 'input-1',
    type: 'input',
    data: {
      schema: {
        text: { type: 'string', required: true },
        score: { type: 'number', required: false },
      },
    },
  },
  {
    id: 'js-prepare',
    type: 'js',
    data: {
      // input.value contains full input object {text, score}
      code: `
const data = input.value || input;
return {
  text: data.text || '',
  score: data.score ?? 50,
  timestamp: new Date().toISOString()
};
      `.trim(),
    },
  },
  {
    id: 'if-else-1',
    type: 'if-else',
    data: {
      expression: 'input.score >= 50',
    },
  },
  {
    id: 'http-1',
    type: 'http',
    data: {
      method: 'POST',
      url: 'https://httpbin.org/post',
      headers: { 'Content-Type': 'application/json' },
    },
  },
  {
    id: 'js-skip',
    type: 'js',
    data: {
      code: 'return { skipped: true, reason: "Score below threshold", data: input };',
    },
  },
  {
    id: 'js-after-http',
    type: 'js',
    data: {
      // Format HTTP response for LLM
      code: `
const json = input.json || input;
return {
  httpResult: JSON.stringify(json, null, 2),
  success: true
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
      userPrompt: 'What is 2+2? Reply with just the number.',
      temperature: 0,
      maxTokens: 10,
    },
  },
  {
    id: 'js-format',
    type: 'js',
    data: {
      // input is either a string (LLM response "4") or object (skip branch { skipped: true, ... })
      code: `
if (typeof input === 'string') {
  // From LLM branch - input is the response directly
  return {
    llmResponse: input,
    httpResult: null,
    skipped: false,
    timestamp: new Date().toISOString()
  };
} else {
  // From skip branch
  return {
    llmResponse: null,
    httpResult: null,
    skipped: input.skipped || false,
    reason: input.reason || null,
    timestamp: new Date().toISOString()
  };
}
      `.trim(),
    },
  },
  {
    id: 'output-1',
    type: 'output',
    data: {},
  },
];

export const FULL_TEST_EDGES: WorkflowEdge[] = [
  // Input -> JS prepare (use 'value' to get full input object)
  { id: 'e1', source: 'input-1', sourceHandle: 'value', target: 'js-prepare', targetHandle: 'input' },
  // JS prepare -> If-Else
  { id: 'e2', source: 'js-prepare', sourceHandle: 'output', target: 'if-else-1', targetHandle: 'input' },
  // If-Else true branch -> HTTP -> JS after HTTP -> LLM
  { id: 'e3', source: 'if-else-1', sourceHandle: 'true', target: 'http-1', targetHandle: 'body' },
  { id: 'e5', source: 'http-1', sourceHandle: 'response', target: 'js-after-http', targetHandle: 'input' },
  { id: 'e6', source: 'js-after-http', sourceHandle: 'output', target: 'llm-1', targetHandle: 'prompt' },
  { id: 'e7', source: 'llm-1', sourceHandle: 'response', target: 'js-format', targetHandle: 'input' },
  // If-Else false branch -> JS skip -> format
  { id: 'e4', source: 'if-else-1', sourceHandle: 'false', target: 'js-skip', targetHandle: 'input' },
  { id: 'e8', source: 'js-skip', sourceHandle: 'output', target: 'js-format', targetHandle: 'input' },
  // Format -> Output
  { id: 'e9', source: 'js-format', sourceHandle: 'output', target: 'output-1', targetHandle: 'value' },
];

export const FULL_TEST_AGENT = {
  name: 'Test Agent (Full)',
  description: 'Tests all node types - http uses httpbin.org, llm requires provider config',
  nodes: FULL_TEST_NODES,
  edges: FULL_TEST_EDGES,
};
