import type { WorkflowNode } from '../../domain/entities/Agent.js';

/**
 * Math Skill Agent: A simple skill that performs math operations
 * Used as a tool by the Skills Test Agent
 * Uses template-based data flow with {{node:id.path}} syntax
 */
export const MATH_SKILL_NODES: WorkflowNode[] = [
  {
    id: 'input-1',
    type: 'input',
    data: {
      schema: {
        operation: { type: 'string', required: true, default: 'add' }, // add, subtract, multiply, divide
        a: { type: 'number', required: true, default: 5 },
        b: { type: 'number', required: true, default: 3 },
      },
    },
  },
  {
    id: 'js-calc',
    type: 'js',
    data: {
      // input comes from workflow input (operation, a, b)
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
    data: {
      value: '{{node:js-calc.output}}',
    },
  },
];

export const MATH_SKILL_AGENT = {
  name: 'Math Skill',
  description: 'A skill that performs basic math operations (add, subtract, multiply, divide)',
  nodes: MATH_SKILL_NODES,
};
