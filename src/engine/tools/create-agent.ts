/**
 * create_agent - Built-in tool for creating new agents
 */

import type { BuiltinToolDefinition } from './types.js';

export const CREATE_AGENT_TOOL: BuiltinToolDefinition = {
  type: 'builtin',
  name: 'create_agent',
  description: `Create a new agent with a custom workflow using template-based data flow.

Available node types:
- input: Entry point. Data: { schema: { fieldName: { type: "string"|"number"|"boolean", required: boolean } } }
- output: Collects results. Data: { value: "{{node:nodeId.path}}" }
- llm: Language model. Data: { provider: "openai"|"anthropic"|"ollama", model: string, systemPrompt: string, userPrompt: string, temperature: number, maxTokens: number, tools?: array }
- http: HTTP request. Data: { method: "GET"|"POST"|"PUT"|"DELETE", url: string, headers?: object, body?: string }
- js: JavaScript code. Data: { code: string } - code receives 'input' variable and should return result
- agent: Call sub-agent. Data: { agentId: string }
- if-else: Conditional. Data: { expression: string } - JS expression returning boolean

Data flow uses templates:
- {{node:nodeId.path}} - Reference another node's output (e.g., {{node:llm-1.response}}, {{node:input-1.message}})
- {{secret:KEY}} - Reference a secret`,
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
