import { WorkflowNode, WorkflowEdge } from "../../domain/entities/Agent.js";
import { SAVE_NOTE_TOOL } from "../tools/save-note.js";

// Default workflow: Input (text) -> LLM -> Output
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
      userPrompt: '{{message}}',
      temperature: 0.7,
      maxTokens: 1000,
      tools: [SAVE_NOTE_TOOL],
    },
  },
  {
    id: 'output-1',
    type: 'output',
    data: {},
  },
];

export const DEFAULT_EDGES: WorkflowEdge[] = [
  {
    id: 'edge-1',
    source: 'input-1',
    sourceHandle: 'message',
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
