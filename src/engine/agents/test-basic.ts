/**
 * Basic Test Agent: Input -> JS -> Output
 * No external dependencies - tests core node functionality
 * Uses template-based data flow with {{node:id.path}} syntax
 */

import type { WorkflowNode } from '../../domain/entities/Agent.js';

export const BASIC_TEST_NODES: WorkflowNode[] = [
  {
    id: 'input-1',
    type: 'input',
    data: {
      schema: {
        text: { type: 'string', required: true, default: 'Hello World' },
        score: { type: 'number', required: false, default: 75 },
      },
    },
  },
  {
    id: 'js-1',
    type: 'js',
    data: {
      // input comes from workflow input (text, score)
      code: `
const text = input.text || '';
const score = input.score ?? 50;
const status = score >= 50 ? 'PASS' : 'FAIL';
const message = score >= 50 ? 'Score is passing' : 'Score is below threshold';
return {
  original: text,
  uppercase: text.toUpperCase(),
  length: text.length,
  score: score,
  status: status,
  message: message,
  timestamp: new Date().toISOString()
};
      `.trim(),
    },
  },
  {
    id: 'output-1',
    type: 'output',
    data: {
      value: '{{node:js-1.output}}',
    },
  },
];

export const BASIC_TEST_AGENT = {
  name: 'Test Agent (Basic)',
  description: 'Tests input, js, output nodes - no external dependencies',
  nodes: BASIC_TEST_NODES,
};
