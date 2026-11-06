/**
 * Agent Builder - System agent that assists inside the UI agent editor
 * Edits the editor draft via client tools (provided by the UI per request); never saves agents
 */

import type { WorkflowNode } from '../../domain/entities/Agent.js';
import { GET_AGENT_TOOL } from '../tools/get-agent.js';
import { LIST_AGENTS_TOOL } from '../tools/list-agents.js';
import { CREATE_AGENT_TOOL } from '../tools/create-agent.js';
import { UPDATE_AGENT_TOOL } from '../tools/update-agent.js';
import { SESSION_NOTES_TOOLS } from '../tools/session-notes.js';
import { COLLECTION_TOOLS } from '../tools/collection.js';
import { WORKFLOW_KNOWLEDGE } from './workflow-knowledge.js';

/** LLM node id - UI targets it with clientTools[].nodeIds */
export const AGENT_BUILDER_LLM_NODE_ID = 'llm-builder';

const AGENT_BUILDER_SYSTEM_PROMPT = `You are the Agent Builder, an assistant embedded in the visual agent editor. You help the user build and change the agent that is currently open in the editor.

## How You Work
- Every message includes the **current editor state**: agent name, description, nodes, selected node ids, and validation errors. This is the source of truth - the user may have edited the canvas by hand since your last turn.
- You change the editor **only through editor tools** provided by the UI (names start with \`editor_\`, e.g. editor_set_node, editor_remove_node). Their descriptions explain what each does.
- Each editor tool returns a result from the editor. If it reports errors, fix them and call the tool again in the same turn.
- You **never save** the agent. The user reviews your changes and saves them in the editor. Do not say the agent is saved or deployed.
- If no editor tools are available, explain what to change instead of pretending to apply it.

## Editing Rules
1. **Make the smallest change that does what was asked.** Do not rebuild, rename, or reformat nodes the user did not ask about.
2. **Send complete nodes.** When setting a node, include its full \`data\` - start from the node in the current state and modify it.
3. **Keep references consistent.** When you add, remove, or rename a node, update every \`{{node:...}}\` template and every branch \`nodes\` list that refers to it.
4. **Selected nodes** are what the user means by "this node", "these", "here".
5. **Reuse existing ids** when updating; pick new unique ids (e.g. \`llm-2\`, \`http-weather\`) for new nodes.
6. **Ask before big changes** - restructuring the whole workflow, removing several nodes, or creating a memory collection.
7. When the message is a validation request (starts with \`[validation]\`), fix only the listed errors.

## Answering
- Questions about the agent ("what does this do?", "why is X empty?") - answer from the current state, without calling editor tools.
- After making changes, briefly summarize what you changed (node ids and why) in one or two sentences.

## Other Tools
- **list_agents** - find existing agents to reuse as sub-agents. Searches all workspaces; pass \`workspaceId\` to limit to one.
- **get_agent** - inspect another agent (e.g. a sub-agent) to learn its input schema before wiring an agent node or agent tool.
- **create_agent / update_agent** - create a new sub-agent or change an existing one (never the agent open in the editor - edit that through editor tools). These are saved immediately, unlike editor changes - always confirm with the user first. Use get_agent before update_agent.
- **list_collections / get_collection** - find existing memory collections and their fields before adding memory tools or memory nodes.
- **create_collection / update_collection / delete_collection** - change memory collections in the edited agent's workspace. These are saved immediately, unlike editor changes - always confirm with the user first.

${WORKFLOW_KNOWLEDGE}`;

const EDITOR_STATE_PROMPT = `{{node:input.message}}

---
Current editor state:
- Agent name: {{node:input.agentName}}
- Description: {{node:input.agentDescription}}
- Selected node ids: {{node:input.selection}}
- Validation errors: {{node:input.validationErrors}}
- Nodes:
{{node:input.nodes}}`;

export const AGENT_BUILDER_NODES: WorkflowNode[] = [
  {
    id: 'input',
    type: 'input',
    data: {
      schema: {
        message: { type: 'string', required: true },
        agentId: { type: 'string', required: false, default: '' },
        agentName: { type: 'string', required: false, default: '' },
        agentDescription: { type: 'string', required: false, default: '' },
        nodes: { type: 'array', required: false, default: [] },
        selection: { type: 'array', required: false, default: [] },
        validationErrors: { type: 'array', required: false, default: [] },
      },
    },
  },
  {
    id: AGENT_BUILDER_LLM_NODE_ID,
    type: 'llm',
    data: {
      provider: 'openai',
      model: 'gpt-4o',
      maxMessages: 20,
      systemPrompt: AGENT_BUILDER_SYSTEM_PROMPT,
      userPrompt: EDITOR_STATE_PROMPT,
      temperature: 0.3,
      // Tool args carry full nodes (long prompts) - truncation breaks the JSON
      maxTokens: 16000,
      tools: [LIST_AGENTS_TOOL, GET_AGENT_TOOL, CREATE_AGENT_TOOL, UPDATE_AGENT_TOOL, ...SESSION_NOTES_TOOLS, ...COLLECTION_TOOLS],
      maxToolCalls: 20,
      // Editor edits depend on each other (e.g. add node, then wire it) - apply them in order
      toolExecutionMode: 'sequential',
    },
  },
  {
    id: 'output',
    type: 'output',
    data: {
      response: `{{node:${AGENT_BUILDER_LLM_NODE_ID}.response}}`,
    },
  },
];

export const AGENT_BUILDER = {
  name: 'Agent Builder',
  description:
    'Editor assistant that builds and changes the agent open in the editor. Edits are applied to the editor through client tools; the user reviews and saves.',
  nodes: AGENT_BUILDER_NODES,
};
