/**
 * update_agent - Built-in tool for updating an existing agent
 */

import type { BuiltinToolDefinition } from './types.js';

export const UPDATE_AGENT_TOOL: BuiltinToolDefinition = {
  type: 'builtin',
  name: 'update_agent',
  description: `Update an existing agent's workflow. Use get_agent first to fetch the current definition, then modify and save with this tool. Node types and edge structure are the same as create_agent.`,
  parameters: {
    type: 'object',
    properties: {
      agentId: {
        type: 'string',
        description: 'The ID of the agent to update',
      },
      name: {
        type: 'string',
        description: 'New name for the agent (optional)',
      },
      description: {
        type: 'string',
        description: 'New description for the agent (optional)',
      },
      nodes: {
        type: 'array',
        description: 'New array of workflow nodes (optional). Each node: { id: string, type: string, data: object }',
      },
      edges: {
        type: 'array',
        description: 'New array of edges (optional). Each edge: { id: string, source: nodeId, sourceHandle: string, target: nodeId, targetHandle: string }',
      },
    },
    required: ['agentId'],
  },
};
