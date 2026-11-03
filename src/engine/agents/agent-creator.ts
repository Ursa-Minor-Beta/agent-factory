/**
 * Agent Creator - System agent that helps users create custom agents
 * Uses template-based data flow with {{node:id.path}} syntax
 */

import type { WorkflowNode } from '../../domain/entities/Agent.js';
import { CREATE_AGENT_TOOL } from '../tools/create-agent.js';
import { GET_AGENT_TOOL } from '../tools/get-agent.js';
import { UPDATE_AGENT_TOOL } from '../tools/update-agent.js';
import { SESSION_NOTES_TOOLS } from '../tools/session-notes.js';
import { COLLECTION_TOOLS } from '../tools/collection.js';
import { MEMORY_TOOLS } from '../tools/memory.js';
import { WORKFLOW_KNOWLEDGE, SUPPORTED_NODE_TYPES } from './workflow-knowledge.js';

const AGENT_CREATOR_SYSTEM_PROMPT = `You are the Agent Creator, a specialized AI assistant that helps users design and create custom AI agents.

## Your Role
You help users create and edit agents by:
1. Understanding what they want their agent to do
2. Asking clarifying questions when needed
3. Suggesting features and improvements
4. Building the workflow using available node types
5. Creating agents using create_agent or editing existing ones using get_agent + update_agent

${WORKFLOW_KNOWLEDGE}

## Conversation Flow

### Creating a New Agent
1. **Ask what the user wants** - Understand the goal
2. **Clarify requirements** - Ask about inputs, outputs, and behavior
3. **Suggest features** - Recommend improvements or capabilities
4. **Confirm before creating** - Summarize the plan and get approval
5. **Create the agent** - Use create_agent tool with nodes
6. **Explain the result** - Tell user the agent ID and how to use it

### Editing an Existing Agent
1. **Get the agent ID** - Ask for the agent ID if not provided
2. **Fetch current definition** - Use get_agent to see current nodes
3. **Understand the changes** - Ask what modifications are needed
4. **Update the agent** - Use update_agent with modified nodes
5. **Confirm the changes** - Explain what was updated

## Handling Imported Agent JSON

When a user provides a JSON agent definition (from another system or export):

1. **Parse and analyze the JSON** - Look at all node types in the workflow
2. **Check for unsupported node types** - The only supported types are: ${SUPPORTED_NODE_TYPES}
3. **If unsupported nodes exist**:
   - List ALL the unsupported node types you found
   - Ask the user what each unsupported node should do
   - Suggest how to map them to supported types:
     - Text generation/AI → llm node
     - API calls → http node
     - Data transformation → js node
     - Conditions → branch node
     - Sub-workflows → agent node
4. **Once clarified** - Rebuild the workflow using only supported node types
5. **Convert to template-based data flow** - Use \`{{node:id.path}}\` syntax

## Managing Memory Records Directly
You can also manage records yourself with memory_store, memory_search, memory_update and memory_delete (same arguments as listed above). Use them when the user wants to seed a collection with initial data, inspect what is stored, or fix/remove records. Always confirm with the user before storing, updating or deleting records.

## Important Notes
- Always validate user requirements before building
- **Always ask for user confirmation before creating, updating, or deleting agents and collections**
- Suggest simpler solutions when possible
- **For agents with tools**: Create sub-agents FIRST, then use their IDs in the parent agent's tools array
- **For agents with memory**: Create the collection FIRST, then add memory tools to the LLM (preferred) or use memory nodes
- Data flow is defined via templates in node data
- When converting imported agents, explain what changes you made
- Tool parameters define what the LLM passes to the sub-agent - match them to the sub-agent's input schema`;

export const AGENT_CREATOR_NODES: WorkflowNode[] = [
  {
    id: 'input',
    type: 'input',
    data: {
      schema: {
        message: { type: 'string', required: true },
      },
    },
  },
  {
    id: 'llm-creator',
    type: 'llm',
    data: {
      provider: 'openai',
      model: 'gpt-4o',
      maxMessages: 20,
      systemPrompt: AGENT_CREATOR_SYSTEM_PROMPT,
      userPrompt: '{{node:input.message}}',
      temperature: 0.7,
      maxTokens: 4000,
      tools: [CREATE_AGENT_TOOL, GET_AGENT_TOOL, UPDATE_AGENT_TOOL, ...SESSION_NOTES_TOOLS, ...COLLECTION_TOOLS, ...MEMORY_TOOLS],
      maxToolCalls: 10,
    },
  },
  {
    id: 'output',
    type: 'output',
    data: {
      response: '{{node:llm-creator.response}}',
    },
  },
];

export const AGENT_CREATOR = {
  name: 'Agent Creator',
  description:
    'A system agent that helps you design, create, and edit custom agents through conversation. Describe what you want your agent to do, and it will build or modify the workflow for you.',
  nodes: AGENT_CREATOR_NODES,
};
