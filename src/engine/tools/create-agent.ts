/**
 * create_agent - Built-in tool for creating new agents
 */

import type { BuiltinToolDefinition } from './types.js';
import { generateNodeSummaryForTool } from '../nodes/definitions.js';
import { COMMON_NODE_FIELDS } from '../nodes/definition.types.js';

export const CREATE_AGENT_TOOL: BuiltinToolDefinition = {
  type: 'builtin',
  name: 'create_agent',
  description: `Create a new agent with a custom workflow using template-based data flow.

Available node types:
${generateNodeSummaryForTool()}

Node-level fields (next to id/type, not inside data; not on output nodes):
${COMMON_NODE_FIELDS.map((f) => `- ${f.name}: ${f.description}`).join('\n')}

Data flow uses templates:
- {{node:nodeId.path}} - Reference another node's output (e.g., {{node:llm-1.response}}, {{node:input-1.message}})
- {{secret:KEY}} - Reference a secret
- {{var:KEY}} - Reference a user variable (plain text, any node input)`,
  parameters: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Name of the agent (required)',
      },
      description: {
        type: 'string',
        description: 'Description of what the agent does',
      },
      nodes: {
        type: 'array',
        description: 'Array of workflow nodes. Each node: { id: string, type: string, data: object }',
      },
    },
    required: ['name', 'nodes'],
  },
};
