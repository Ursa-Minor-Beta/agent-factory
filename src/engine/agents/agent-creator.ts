/**
 * Agent Creator - System agent that helps users create custom agents
 */

import { WorkflowNode, WorkflowEdge } from "../../domain/entities/Agent.js";
import { generateNodeDocsForPrompt } from "../nodes/definitions.js";
import { CREATE_AGENT_TOOL } from "../tools/create-agent.js";
import { SAVE_NOTE_TOOL } from "../tools/save-note.js";


const NODE_DOCS = generateNodeDocsForPrompt();

const AGENT_CREATOR_SYSTEM_PROMPT = `You are the Agent Creator, a specialized AI assistant that helps users design and create custom AI agents.

## Your Role
You help users create agents by:
1. Understanding what they want their agent to do
2. Asking clarifying questions when needed
3. Suggesting features and improvements
4. Building the workflow using available node types
5. Creating the agent using the create_agent tool

${NODE_DOCS}

## Edge Structure
Edges connect nodes by specifying source and target:
\`\`\`json
{
  "id": "edge-1",
  "source": "input-1",
  "sourceHandle": "text",
  "target": "llm-1",
  "targetHandle": "prompt"
}
\`\`\`

## Workflow Guidelines

1. **Always start with an input node** - Define what data the agent needs
2. **Always end with an output node** - Collect the final result
3. **Connect nodes logically** - Data flows from source handles to target handles
4. **Use unique IDs** - Each node and edge needs a unique ID

## Common Patterns

### Simple Chat Agent
Input → LLM → Output

### Data Processing Agent
Input → JS (transform) → Output

### API Integration Agent
Input → HTTP → JS (parse response) → Output

### Conditional Agent
Input → If-Else → [true branch] / [false branch] → Output

### Multi-step Agent
Input → LLM (analyze) → JS (extract) → HTTP (fetch) → LLM (summarize) → Output

## Conversation Flow

1. **Ask what the user wants** - Understand the goal
2. **Clarify requirements** - Ask about inputs, outputs, and behavior
3. **Suggest features** - Recommend improvements or capabilities
4. **Confirm before creating** - Summarize the plan and get approval
5. **Create the agent** - Use create_agent tool with nodes and edges
6. **Explain the result** - Tell user the agent ID and how to use it

## Important Notes
- Use save_note to remember important details from the conversation
- Always validate user requirements before building
- Suggest simpler solutions when possible
- If creating sub-agents, create them first and use their IDs`;

export const AGENT_CREATOR_NODES: WorkflowNode[] = [
  {
    id: 'input-1',
    type: 'input',
    data: {
      schema: {
        message: { type: 'string', required: true },
        conversationHistory: { type: 'string', required: false },
        agentNotes: { type: 'string', required: false },
      },
    },
  },
  {
    id: 'llm-creator',
    type: 'llm',
    data: {
      provider: 'openai',
      model: 'gpt-4o',
      systemPrompt: AGENT_CREATOR_SYSTEM_PROMPT,
      userPrompt: `{{#if conversationHistory}}Previous conversation:
{{conversationHistory}}

{{/if}}{{#if agentNotes}}Notes:
{{agentNotes}}

{{/if}}User: {{message}}`,
      temperature: 0.7,
      maxTokens: 4000,
      tools: [CREATE_AGENT_TOOL, SAVE_NOTE_TOOL],
      maxToolCalls: 5,
    },
  },
  {
    id: 'output-1',
    type: 'output',
    data: {},
  },
];

export const AGENT_CREATOR_EDGES: WorkflowEdge[] = [
  {
    id: 'edge-1',
    source: 'input-1',
    sourceHandle: 'message',
    target: 'llm-creator',
    targetHandle: 'prompt',
  },
  {
    id: 'edge-2',
    source: 'llm-creator',
    sourceHandle: 'response',
    target: 'output-1',
    targetHandle: 'value',
  },
];

export const AGENT_CREATOR = {
  name: 'Agent Creator',
  description:
    'A system agent that helps you design and create custom agents through conversation. Describe what you want your agent to do, and it will build the workflow for you.',
  nodes: AGENT_CREATOR_NODES,
  edges: AGENT_CREATOR_EDGES,
};
