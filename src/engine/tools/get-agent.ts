/**
 * get_agent - Built-in tool for fetching an existing agent's definition
 */

import type { BuiltinToolDefinition } from './types.js';

export const GET_AGENT_TOOL: BuiltinToolDefinition = {
  type: 'builtin',
  name: 'get_agent',
  description: `Fetch an existing agent's definition including its nodes and edges. Use this to understand an agent's current structure before editing it.`,
  parameters: {
    type: 'object',
    properties: {
      agentId: {
        type: 'string',
        description: 'The ID of the agent to fetch',
      },
    },
    required: ['agentId'],
  },
};
