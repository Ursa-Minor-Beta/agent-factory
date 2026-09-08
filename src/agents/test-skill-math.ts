import type { WorkflowNode, WorkflowEdge } from '../domain/entities/Agent.js';

/**
 * Math Skill Agent: A simple skill that performs math operations
 * Used as a tool by the Skills Test Agent
 */

export const MATH_SKILL_NODES: WorkflowNode[] = [
  {
    id: 'input-1',
    type: 'input',
    position: { x: 100, y: 200 },
    data: {
      schema: {
        operation: { type: 'string', required: true }, // add, subtract, multiply, divide
        a: { type: 'number', required: true },
        b: { type: 'number', required: true },
      },
    },
  },
  {
    id: 'js-calc',
    type: 'js',
    position: { x: 300, y: 200 },
    data: {
      code: `
const { operation, a, b } = input;
let result;
let error = null;

switch (operation) {
  case 'add':
    result = a + b;
    break;
  case 'subtract':
    result = a - b;
    break;
  case 'multiply':
    result = a * b;
    break;
  case 'divide':
    if (b === 0) {
      error = 'Division by zero';
      result = null;
    } else {
      result = a / b;
    }
    break;
  default:
    error = 'Unknown operation: ' + operation;
    result = null;
}

return {
  operation,
  a,
  b,
  result,
  error,
  expression: error ? null : a + ' ' + operation + ' ' + b + ' = ' + result
};
      `.trim(),
    },
  },
  {
    id: 'output-1',
    type: 'output',
    position: { x: 500, y: 200 },
    data: {},
  },
];

export const MATH_SKILL_EDGES: WorkflowEdge[] = [
  { id: 'e1', source: 'input-1', sourceHandle: 'value', target: 'js-calc', targetHandle: 'input' },
  { id: 'e2', source: 'js-calc', sourceHandle: 'output', target: 'output-1', targetHandle: 'value' },
];

export const MATH_SKILL_AGENT = {
  name: 'Math Skill',
  description: 'A skill that performs basic math operations (add, subtract, multiply, divide)',
  nodes: MATH_SKILL_NODES,
  edges: MATH_SKILL_EDGES,
};
