/**
 * list_agents - Built-in tool for listing the user's agents
 */

import type { BuiltinToolDefinition } from './types.js';
import { PAGING_PARAMETERS, PAGING_HINT } from './paging.js';

export const LIST_AGENTS_TOOL: BuiltinToolDefinition = {
  type: 'builtin',
  name: 'list_agents',
  description: `List the user's agents (id, name, description, workspaceId) across all workspaces, or in one workspace when workspaceId is given. Use this to find an agent to call as a sub-agent, then use get_agent for its full definition. ${PAGING_HINT}`,
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
      ...PAGING_PARAMETERS,
    },
  },
};
