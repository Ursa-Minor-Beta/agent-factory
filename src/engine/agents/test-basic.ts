
/**
 * Basic Test Agent: Input -> JS -> If-Else -> Output
 * No external dependencies - tests core node functionality
 */

import { WorkflowNode, WorkflowEdge } from "../../domain/entities/Agent.js";

export const BASIC_TEST_NODES: WorkflowNode[] = [
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
    id: 'js-1',
    type: 'js',
    data: {
      // input contains full object {text, score} from 'value' handle
      code: `
const text = input.text || '';
const score = input.score ?? 50;
return {
  original: text,
  uppercase: text.toUpperCase(),
  length: text.length,
  score: score,
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
    id: 'js-pass',
    type: 'js',
    data: {
      code: 'return { ...input, status: "PASS", message: "Score is passing" };',
    },
  },
  {
    id: 'js-fail',
    type: 'js',
    data: {
      code: 'return { ...input, status: "FAIL", message: "Score is below threshold" };',
    },
  },
  {
    id: 'output-1',
    type: 'output',
    data: {},
  },
];

export const BASIC_TEST_EDGES: WorkflowEdge[] = [
  // Use 'value' handle to get full input object {text, score}
  { id: 'e1', source: 'input-1', sourceHandle: 'value', target: 'js-1', targetHandle: 'input' },
  { id: 'e2', source: 'js-1', sourceHandle: 'output', target: 'if-else-1', targetHandle: 'input' },
  { id: 'e3', source: 'if-else-1', sourceHandle: 'true', target: 'js-pass', targetHandle: 'input' },
  { id: 'e4', source: 'if-else-1', sourceHandle: 'false', target: 'js-fail', targetHandle: 'input' },
  { id: 'e5', source: 'js-pass', sourceHandle: 'output', target: 'output-1', targetHandle: 'value' },
  { id: 'e6', source: 'js-fail', sourceHandle: 'output', target: 'output-1', targetHandle: 'value' },
];

export const BASIC_TEST_AGENT = {
  name: 'Test Agent (Basic)',
  description: 'Tests input, js, if-else, output nodes - no external dependencies',
  nodes: BASIC_TEST_NODES,
  edges: BASIC_TEST_EDGES,
};
