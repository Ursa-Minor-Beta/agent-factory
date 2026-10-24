import type { NodeDefinitionRaw } from './definition.types.js';

export const BRANCH_NODE_DEFINITION: NodeDefinitionRaw = {
  type: 'branch',
  description: 'Multi-way conditional branching with execution control. Only nodes in the active branch execute.',
  statusText: 'Evaluating condition...',
  inputs: ['input'],
  outputs: ['activeBranch', '*'],
  options: [
    {
      name: 'input',
      type: 'string',
      description: 'Template for input value to evaluate. Supports {{node:id.path}} syntax.',
    },
    {
      name: 'branches',
      type: 'object',
      required: true,
      description: 'Array of branch definitions. Each has: name (string), condition (expression), nodes (array of node IDs to execute if active).',
    },
    {
      name: 'persistedFields',
      type: 'enum[]',
      description: 'Fields to persist in run state for debugging. Empty by default.',
      values: ['input', 'activeBranch'],
    },
  ],
  features: [
    'Evaluates branches in order, activates first matching condition',
    'Only nodes in active branch execute - others are skipped',
    'Nodes not listed in any branch execute unless ALL of their {{node:...}} dependencies were skipped',
    'Each branch outputs input value if active, null if inactive',
    'Outputs activeBranch name for reference',
  ],
  examples: [
    {
      name: 'Score evaluation',
      description: 'Execute different LLM nodes based on score',
      id: 'branch-1',
      type: 'branch',
      data: {
        input: '{{node:input.score}}',
        branches: [
          {
            name: 'high',
            condition: 'input >= 90',
            nodes: ['llm-high', 'format-high'],
          },
          {
            name: 'pass',
            condition: 'input >= 60',
            nodes: ['llm-pass', 'format-pass'],
          },
          {
            name: 'fail',
            condition: 'true',
            nodes: ['llm-fail', 'format-fail'],
          },
        ],
      },
    },
    {
      name: 'Status routing',
      description: 'Route API responses by status code',
      id: 'branch-2',
      type: 'branch',
      data: {
        input: '{{node:http-1.response}}',
        branches: [
          {
            name: 'success',
            condition: 'input.status >= 200 && input.status < 300',
            nodes: ['process-success'],
          },
          {
            name: 'error',
            condition: 'true',
            nodes: ['handle-error', 'log-error'],
          },
        ],
      },
    },
  ],
};
