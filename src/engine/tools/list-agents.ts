/**
 * list_agents - Built-in tool for listing the user's agents
 */

import type { BuiltinToolDefinition } from './types.js';

export const LIST_AGENTS_TOOL: BuiltinToolDefinition = {
  type: 'builtin',
  name: 'list_agents',
  description: `List the user's agents (id, name, description, workspaceId) across all workspaces, or in one workspace when workspaceId is given. Use this to find an agent to call as a sub-agent, then use get_agent for its full definition.`,
  parameters: {
    type: 'object',
    properties: {
      workspaceId: {
        type: 'string',
        description: 'Optional: only list agents in this workspace. Omit to search all workspaces.',
      },
      name: {
        type: 'string',
        description: 'Optional filter: agent name contains this text (case-insensitive)',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of agents to return (default 50)',
      },
    },
  },
};
