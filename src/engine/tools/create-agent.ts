/**
 * create_agent - Built-in tool for creating new agents
 */

import type { BuiltinToolDefinition } from './types.js';

export const CREATE_AGENT_TOOL: BuiltinToolDefinition = {
  type: 'builtin',
  name: 'create_agent',
  description: `Create a new agent with a custom workflow. Build the workflow using nodes and edges.

Available node types:
- input: Entry point. Data: { schema: { fieldName: { type: "string"|"number"|"boolean", required: boolean } } }
- output: Collects results. Data: {}
- llm: Language model. Data: { provider: "openai"|"anthropic"|"ollama", model: string, systemPrompt: string, userPrompt: string, temperature: number, maxTokens: number, tools?: array }
- http: HTTP request. Data: { method: "GET"|"POST"|"PUT"|"DELETE", url: string, headers?: object, body?: string }
- js: JavaScript code. Data: { code: string } - code receives 'input' variable and should return result
- agent: Call sub-agent. Data: { agentId: string }
- if-else: Conditional. Data: { expression: string } - JS expression returning boolean

Edge structure: { id, source, sourceHandle, target, targetHandle }
Common handles: input nodes output field names, llm outputs "response", js outputs "output", http outputs "response"`,
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
      edges: {
        type: 'array',
        description: 'Array of edges connecting nodes. Each edge: { id: string, source: nodeId, sourceHandle: string, target: nodeId, targetHandle: string }',
      },
    },
    required: ['name', 'nodes', 'edges'],
  },
};
