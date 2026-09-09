import { WorkflowNode, WorkflowEdge } from "../../domain/entities/Agent.js";

/**
 * Skills Test Agent: An orchestrator that uses LLM with tools to call skill agents
 * Tests the tool calling functionality
 *
 * The tools.agentId will be resolved at seed time by looking up the skill agent
 */


// Tool definition placeholder - agentId will be injected at seed time
export const SKILLS_TOOL_DEFINITIONS = [
  {
    type: 'agent' as const,
    agentId: '{{MATH_SKILL_AGENT_ID}}', // Placeholder - replaced during seeding
    name: 'calculate',
    description: 'Perform a math calculation. Use this when the user asks to add, subtract, multiply, or divide numbers.',
    parameters: {
      type: 'object' as const,
      properties: {
        operation: {
          type: 'string',
          description: 'The operation to perform: add, subtract, multiply, or divide',
        },
        a: {
          type: 'number',
          description: 'The first number',
        },
        b: {
          type: 'number',
          description: 'The second number',
        },
      },
      required: ['operation', 'a', 'b'],
    },
  },
];

export const SKILLS_TEST_NODES: WorkflowNode[] = [
  {
    id: 'input-1',
    type: 'input',
    position: { x: 100, y: 200 },
    data: {
      schema: {
        message: { type: 'string', required: true },
      },
    },
  },
  {
    id: 'llm-orchestrator',
    type: 'llm',
    position: { x: 350, y: 200 },
    data: {
      provider: 'openai',
      model: 'gpt-4o-mini',
      systemPrompt: `You are a helpful assistant with access to tools.
When the user asks you to perform a math calculation, use the calculate tool.
Always respond with a clear answer after using tools.`,
      userPrompt: '{{message}}',
      temperature: 0.3,
      maxTokens: 500,
      tools: SKILLS_TOOL_DEFINITIONS,
      maxToolCalls: 3,
    },
  },
  {
    id: 'output-1',
    type: 'output',
    position: { x: 600, y: 200 },
    data: {},
  },
];

export const SKILLS_TEST_EDGES: WorkflowEdge[] = [
  { id: 'e1', source: 'input-1', sourceHandle: 'message', target: 'llm-orchestrator', targetHandle: 'prompt' },
  { id: 'e2', source: 'llm-orchestrator', sourceHandle: 'response', target: 'output-1', targetHandle: 'value' },
];

export const SKILLS_TEST_AGENT = {
  name: 'Test Agent (Skills)',
  description: 'Tests LLM tool calling with agent skills - requires OpenAI API key',
  nodes: SKILLS_TEST_NODES,
  edges: SKILLS_TEST_EDGES,
};
