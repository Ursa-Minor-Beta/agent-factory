import type { WorkflowNode, WorkflowEdge } from '../domain/entities/Agent.js';

// Default workflow: Input (text) -> LLM -> Output
export const DEFAULT_NODES: WorkflowNode[] = [
  {
    id: 'input-1',
    type: 'input',
    position: { x: 100, y: 200 },
    data: {
      schema: {
        text: { type: 'string', required: true },
      },
    },
  },
  {
    id: 'llm-1',
    type: 'llm',
    position: { x: 400, y: 200 },
    data: {
      provider: 'openai',
      model: 'gpt-4o-mini',
      systemPrompt: 'You are a helpful assistant.',
      userPrompt: '{{text}}',
      temperature: 0.7,
      maxTokens: 1000,
    },
  },
  {
    id: 'output-1',
    type: 'output',
    position: { x: 700, y: 200 },
    data: {},
  },
];

export const DEFAULT_EDGES: WorkflowEdge[] = [
  {
    id: 'edge-1',
    source: 'input-1',
    sourceHandle: 'text',
    target: 'llm-1',
    targetHandle: 'prompt',
  },
  {
    id: 'edge-2',
    source: 'llm-1',
    sourceHandle: 'response',
    target: 'output-1',
    targetHandle: 'value',
  },
];

export const DEFAULT_AGENT = {
  name: 'Default Agent',
  description: 'A simple text-to-LLM workflow',
  nodes: DEFAULT_NODES,
  edges: DEFAULT_EDGES,
};
