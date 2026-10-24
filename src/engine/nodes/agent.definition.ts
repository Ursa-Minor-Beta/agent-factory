import type { NodeDefinitionRaw } from './definition.types.js';

export const AGENT_NODE_DEFINITION: NodeDefinitionRaw = {
  type: 'agent',
  description: 'Sub-agent node. Executes another agent as part of the workflow.',
  statusText: 'Running agent...',
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
      id: 'agent-1',
      type: 'agent',
      data: {
        agentId: '507f1f77bcf86cd799439011',
      },
    },
  ],
};
