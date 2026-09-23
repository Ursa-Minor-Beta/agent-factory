import type { WorkflowNode } from '../../domain/entities/Agent.js';
import { SESSION_NOTES_TOOLS } from '../tools/session-notes.js';

// Default workflow: Input (text) -> LLM -> Output
// Uses template-based data flow with {{node:id.path}} syntax
export const DEFAULT_NODES: WorkflowNode[] = [
  {
    id: 'input-1',
    type: 'input',
    data: {
      schema: {
        message: { type: 'string', required: true },
      },
    },
  },
  {
    id: 'llm-1',
    type: 'llm',
    data: {
      provider: 'openai',
      model: 'gpt-4o-mini',
      systemPrompt: 'You are a helpful assistant.',
      userPrompt: '{{node:input-1.message}}',
      temperature: 0.7,
      maxTokens: 1000,
      tools: [...SESSION_NOTES_TOOLS],
    },
  },
  {
    id: 'output-1',
    type: 'output',
    data: {
      response: '{{node:llm-1.response}}',
    },
  },
];

export const DEFAULT_AGENT = {
  name: 'Chat Agent',
  description: 'A simple text-to-LLM workflow',
  nodes: DEFAULT_NODES,
};
