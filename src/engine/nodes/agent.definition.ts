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
    {
      name: 'inputs',
      type: 'object',
      required: false,
      description: 'Values for the target agent\'s input schema (defined in its input node). Keys are schema field names, values are literals or templates with {{node:<id>.<output>}} interpolation. Missing required fields (without default) cause an error. Batch mode: if inputs is an array of such objects (or a template resolving to one, e.g. "{{node:js-1.items}}"), the agent runs once per item sequentially and output/run become arrays in item order.',
    },
  ],
  examples: [
    {
      name: 'Call sub-agent',
      description: 'Execute another agent, filling its input schema from previous nodes',
      id: 'agent-1',
      type: 'agent',
      data: {
        agentId: '507f1f77bcf86cd799439011',
        inputs: {
          query: '{{node:llm-1.output}}',
          maxResults: 5,
        },
      },
    },
    {
      name: 'Call sub-agent for each item',
      description: 'Run the agent once per array item; output is an array of results',
      id: 'agent-2',
      type: 'agent',
      data: {
        agentId: '507f1f77bcf86cd799439011',
        inputs: '{{node:js-1.items}}',
      },
    },
  ],
};
