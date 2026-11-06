/**
 * Shared workflow knowledge for agent-building assistants (Agent Creator, Agent Builder)
 * Node docs, template syntax, models, patterns, memory, workspaces, validation rules
 */

import { generateNodeDocsForPrompt, NODE_DEFINITIONS } from '../nodes/definitions.js';
import { MEMORY_FIELD_TYPES } from '../../domain/entities/Memory.js';
import { LLM_PROVIDER_TYPES } from '../../domain/entities/ProviderConfig.js';

const NODE_DOCS = generateNodeDocsForPrompt();
const SUPPORTED_NODE_TYPES = NODE_DEFINITIONS.map((n) => n.type).join(', ');
const MEMORY_FIELD_TYPES_LIST = MEMORY_FIELD_TYPES.join(', ');

export { SUPPORTED_NODE_TYPES };

export const WORKFLOW_KNOWLEDGE = `${NODE_DOCS}

## Template-Based Data Flow

Data flows between nodes using templates in node data. Use \`{{node:nodeId.path}}\` syntax:

\`\`\`json
{
  "id": "llm-1",
  "type": "llm",
  "data": {
    "userPrompt": "Process this: {{node:http-1.response.data}}"
  }
}
\`\`\`

Available template patterns:
- \`{{node:nodeId.path}}\` - Reference another node's output (e.g., \`{{node:http-1.response.json}}\`, \`{{node:input.message}}\`)
- \`{{secret:KEY}}\` - Reference a secret (e.g., \`{{secret:API_KEY}}\`)
- \`{{var:KEY}}\` - Reference a user variable, usable in any node input (e.g., \`{{var:BASE_URL}}\`)

## Workflow Guidelines

1. **Always start with an input node** - Define what data the agent needs
2. **Always end with an output node** - Define output fields directly in data (e.g., \`{ "response": "{{node:llm-1.response}}", "ticket": "{{node:http-1.ticket}}", ... }\`)
3. **Use templates in node data** - Reference other nodes with \`{{node:id.path}}\`
4. **Use unique IDs** - Each node needs a unique ID

## Valid LLM Models

**CRITICAL**: Only use these exact model names. Do NOT invent model names like "gpt-4.1".

OpenAI models:
- \`gpt-6.1-sol\` - Latest flagship, recommended default
- \`gpt-6.1-terra\` - Newest GPT-6.1 family model
- \`gpt-6-astra\` - Previous flagship
- \`gpt-5.6-sol\` - Previous generation, discounted pricing
- \`gpt-5.6-terra\` - Previous generation, mid-tier
- \`gpt-5.6-luna\` - Previous generation, lighter option

Anthropic models:
- \`claude-fable-5-1\` - Most capable (Mythos tier)
- \`claude-opus-5-5\` - Best quality for complex tasks
- \`claude-sonnet-5-5\` - Balanced speed and quality
- \`claude-haiku-5-5\` - Fastest, cheapest

Ollama (provider \`ollama\`, self-hosted): only use a model name the user explicitly provides (e.g., \`llama3.2\`).

DeepSeek (provider \`deepseek\`): \`deepseek-chat\` (general, supports tools), \`deepseek-reasoner\` (reasoning).

Other OpenAI-compatible providers (\`openrouter\`, \`groq\`, \`mistral\`, \`xai\`, \`together\`, \`openai-compatible\`): only use a model name the user explicitly provides.

Supported providers are only: ${LLM_PROVIDER_TYPES.map((p) => `\`${p}\``).join(', ')}. Only use a provider the user has configured.

## Common Patterns

### Simple Chat Agent
\`\`\`json
{
  "nodes": [
    { "id": "input", "type": "input", "data": { "schema": { "message": { "type": "string" } } } },
    { "id": "llm-1", "type": "llm", "data": { "provider": "openai", "model": "gpt-4o", "userPrompt": "{{node:input.message}}" } },
    { "id": "output", "type": "output", "data": { "response": "{{node:llm-1.response}}" } }
  ]
}
\`\`\`

### API Integration Agent
\`\`\`json
{
  "nodes": [
    { "id": "input", "type": "input", "data": { "schema": { "query": { "type": "string" } } } },
    { "id": "http-1", "type": "http", "data": { "url": "https://api.example.com?q={{node:input.query}}" } },
    { "id": "js-1", "type": "js", "data": { "input": "{{node:http-1.response}}", "code": "return input.data;" } },
    { "id": "output", "type": "output", "data": { "result": "{{node:js-1.output}}" } }
  ]
}
\`\`\`

### Conditional Branching
The branch node evaluates branches in order and activates the first whose condition matches. **Only nodes listed in the active branch execute** - nodes in other branches are skipped.

\`\`\`json
{
  "nodes": [
    { "id": "input", "type": "input", "data": { "schema": { "score": { "type": "number" } } } },
    {
      "id": "branch-1",
      "type": "branch",
      "data": {
        "input": "{{node:input.score}}",
        "branches": [
          { "name": "pass", "condition": "input >= 70", "nodes": ["llm-pass"] },
          { "name": "fail", "condition": "true", "nodes": ["llm-fail"] }
        ]
      }
    },
    {
      "id": "llm-pass",
      "type": "llm",
      "data": {
        "provider": "openai",
        "model": "gpt-4o-mini",
        "userPrompt": "Generate a congratulations message for passing with score: {{node:branch-1.pass}}"
      }
    },
    {
      "id": "llm-fail",
      "type": "llm",
      "data": {
        "provider": "openai",
        "model": "gpt-4o-mini",
        "userPrompt": "Generate an encouragement message for score: {{node:branch-1.fail}}"
      }
    },
    {
      "id": "output",
      "type": "output",
      "data": {
        "branch": "{{node:branch-1.activeBranch}}",
        "passMessage": "{{node:llm-pass.response}}",
        "failMessage": "{{node:llm-fail.response}}"
      }
    }
  ]
}
\`\`\`

Branch node details:
- **input**: Value to evaluate (use template like \`{{node:id.path}}\`)
- **branches**: Ordered array of \`{ name, condition, nodes }\`. \`condition\` is a JavaScript expression using the \`input\` variable (e.g., \`input > 5\`, \`input.status === 'approved'\`). Use \`"true"\` as the last condition for a default branch.
- **Outputs**:
  - \`activeBranch\`: Name of the matched branch
  - \`<branchName>\`: The input value if that branch is active, null otherwise
- Nodes not listed in any branch are skipped if any of their \`{{node:...}}\` dependencies were skipped, unless another dependency comes from the active path (merge node).

### JS Node Input
When a JS node needs more than one value, pass them as a JSON object and destructure in code. Values keep their types (arrays/objects stay structured, strings are quoted for you), so no manual parsing is needed:
\`\`\`json
{ "id": "js-2", "type": "js", "data": {
  "input": "{ \\"date\\": {{node:js-1.output.date}}, \\"records\\": {{node:memory-search-1.records}} }",
  "code": "const { date, records } = input;\\nreturn { period: date.slice(0, 7), count: records.length };"
} }
\`\`\`
NEVER join values with a delimiter (\`"{{node:a.x}}|{{node:b.y}}"\`) and split them apart with \`String(input).indexOf('|')\` — it stringifies objects/arrays and breaks when the values contain the delimiter.

### Calling a Sub-Agent as a Workflow Step
Use an agent node when another agent must always run at a fixed point. Fill the target agent's input schema via \`inputs\`:
\`\`\`json
{ "id": "web-fetch-baas", "type": "agent", "data": { "agentId": "<target-agent-id>", "inputs": { "query": "{{node:input.message}}" } } }
\`\`\`
Name the node id after the target agent's name: lowercase, non-alphanumeric characters replaced with \`-\` (e.g. "Web fetch (baas)" → \`web-fetch-baas\`). Add a suffix (\`-2\`) if the id is already taken.
The sub-agent's result is available as \`{{node:web-fetch-baas.output.<field>}}\`.

**Batch mode**: \`inputs\` can also be an array of input objects, or a template resolving to one. The agent then runs once per item, sequentially, and \`output\` becomes an array of results in item order:
\`\`\`json
{ "id": "web-fetch-baas", "type": "agent", "data": { "agentId": "<target-agent-id>", "inputs": [ { "query": "first" }, { "query": "second" } ] } }
{ "id": "web-fetch-baas", "type": "agent", "data": { "agentId": "<target-agent-id>", "inputs": "{{node:js-1.items}}" } }
\`\`\`
Here \`js-1\` must output \`items\` as an array of objects matching the sub-agent's input schema. Read results with \`{{node:agent-3.output}}\` (an array).

### Ordering Without Data (runAfter)
To make a node wait for another node that it does not reference, set \`runAfter\` on the node itself (next to \`id\`/\`type\`, not inside \`data\`):
\`\`\`json
{ "id": "http-notify", "type": "http", "runAfter": ["memory-store-1"], "data": { "url": "https://api.example.com/notify" } }
\`\`\`
**Do not use \`runAfter\` when the node already references the other node** via a \`{{node:<id>...}}\` template (in any field, including \`inputs\`, prompts, \`url\`, etc.). A referenced node is automatically a dependency, so the ordering is already guaranteed. Only use \`runAfter\` for a pure side-effect ordering where no data flows between the two nodes.

### LLM with Tool Calling (Sub-Agent)
When an LLM needs to call another agent as a tool:
\`\`\`json
{
  "nodes": [
    { "id": "input", "type": "input", "data": { "schema": { "message": { "type": "string" } } } },
    {
      "id": "llm-1",
      "type": "llm",
      "data": {
        "provider": "openai",
        "model": "gpt-4o-mini",
        "systemPrompt": "You are a helpful assistant. Use the available tools when needed.",
        "userPrompt": "{{node:input.message}}",
        "tools": [
          {
            "type": "agent",
            "agentId": "<target-agent-id>",
            "name": "search_knowledge",
            "description": "Search the knowledge base for relevant information",
            "parameters": {
              "type": "object",
              "properties": {
                "query": { "type": "string", "description": "The search query" }
              },
              "required": ["query"]
            }
          }
        ],
        "maxToolCalls": 5
      }
    },
    { "id": "output", "type": "output", "data": { "response": "{{node:llm-1.response}}" } }
  ]
}
\`\`\`

## Tool Definition Format

### Builtin Tools (Memory, etc.)
Builtin tools have predefined schemas - do NOT add a \`parameters\` field:
\`\`\`json
{ "type": "builtin", "name": "memory_store" }
{ "type": "builtin", "name": "memory_search" }
\`\`\`

### Agent Tools (Sub-Agents)
When adding agent tools to an LLM node, use this format:

\`\`\`json
{
  "type": "agent",
  "agentId": "<the-agent-id-to-call>",
  "name": "tool_name",
  "description": "What this tool does - be descriptive for the LLM",
  "parameters": {
    "type": "object",
    "properties": {
      "param1": { "type": "string", "description": "Description of param1" },
      "param2": { "type": "number", "description": "Description of param2" }
    },
    "required": ["param1"]
  }
}
\`\`\`

- **type**: "agent" for sub-agents, "builtin" for memory tools
- **agentId**: (agent only) The ID of the agent to invoke
- **name**: (agent only) Function name the LLM will use (snake_case recommended)
- **description**: (agent only) Clear description so the LLM knows when to use it
- **parameters**: (agent only!) JSON Schema - NEVER add this to builtin tools

## Memory Collections

Give agents persistent storage with memory collections.

### When to Use Memory Tools (Recommended)
Use **memory tools** when the LLM should decide dynamically when to read/write:
- Conversational agents that learn from users
- Agents that need to remember context across sessions
- When the decision to store/retrieve depends on conversation content
- When the LLM needs to search semantically based on user questions

### When to Use Memory Nodes
Use **memory nodes** when memory operations should happen at fixed workflow points:
- Always save input data before processing
- Always retrieve related records before generating response
- Batch operations (store all results at the end)
- When memory access is deterministic, not LLM-decided

### Step 1: Create a Collection (if needed, user may provide existing memory details)
Use create_collection tool. Field types: ${MEMORY_FIELD_TYPES_LIST}

\`\`\`json
{
  "name": "knowledge_base",
  "description": "Stores learned facts and user info",
  "fields": [
    { "name": "topic", "type": "string", "required": true, "index": true },
    { "name": "content", "type": "string", "required": true },
    { "name": "source", "type": "string" }
  ]
}
\`\`\`

### Step 2: Add Memory Tools to LLM (Recommended)
Add builtin memory tools so the LLM can dynamically read/write:

\`\`\`json
{
  "nodes": [
    { "id": "input", "type": "input", "data": { "schema": { "message": { "type": "string" } } } },
    {
      "id": "llm-1",
      "type": "llm",
      "data": {
        "systemPrompt": "You are a helpful assistant with long-term memory.\\n\\nBefore answering, use memory_search to check for relevant past information.\\nAfter learning something important, use memory_store to save it for future reference.",
        "userPrompt": "{{node:input.message}}",
        "tools": [
          { "type": "builtin", "name": "memory_store" },
          { "type": "builtin", "name": "memory_search" },
          { "type": "builtin", "name": "memory_update" },
          { "type": "builtin", "name": "memory_delete" }
        ],
        "maxToolCalls": 5
      }
    },
    { "id": "output", "type": "output", "data": { "response": "{{node:llm-1.response}}" } }
  ]
}
\`\`\`

Memory tools (the LLM will see their full parameter schemas automatically):
- **memory_store**: Save data. Pass collection and schema fields directly: \`{ collection: "contacts", name: "Alice", email: "..." }\`
- **memory_search**: Find records by filters: \`{ collection: "contacts", filters: { role: "engineer" }, limit: 10 }\`
- **memory_update**: Update fields: \`{ collection: "contacts", id: "abc", email: "new@email.com" }\`
- **memory_delete**: Delete record: \`{ collection: "contacts", id: "abc" }\`

**CRITICAL**: Builtin tools must NOT have a \`parameters\` field - they have predefined schemas:
\`\`\`json
// CORRECT - no parameters field
{ "type": "builtin", "name": "memory_search" }

// WRONG - do NOT add parameters to builtin tools
{ "type": "builtin", "name": "memory_search", "parameters": { ... } }
\`\`\`

### Alternative: Memory Nodes (Workflow-based)
For fixed data flow where memory operations happen at specific workflow points:

\`\`\`json
{
  "nodes": [
    { "id": "input", "type": "input", "data": { "schema": { "query": { "type": "string" }, "topic": { "type": "string" } } } },
    {
      "id": "memory-search-1",
      "type": "memory-search",
      "data": {
        "collection": "knowledge_base",
        "filters": { "topic": "{{node:input.topic}}" },
        "limit": 5
      }
    },
    {
      "id": "llm-1",
      "type": "llm",
      "data": {
        "provider": "openai",
        "model": "gpt-4o",
        "systemPrompt": "Answer based on the following context:\\n{{node:memory-search-1.records}}",
        "userPrompt": "{{node:input.query}}"
      }
    },
    {
      "id": "memory-store-1",
      "type": "memory-store",
      "data": {
        "collection": "conversation_log",
        "data": {
          "query": "{{node:input.query}}",
          "response": "{{node:llm-1.response}}"
        }
      }
    },
    { "id": "output", "type": "output", "data": { "response": "{{node:llm-1.response}}" } }
  ]
}
\`\`\`

Memory node types and outputs:
- **memory-store**: Saves \`data\` (object matching the collection schema) → outputs \`success\`, \`id\`, \`record\`
- **memory-search**: Finds records → outputs \`records\` (array of matches), \`count\`
- **memory-update**: Merges \`data\` into record \`id\` → outputs \`success\`, \`record\`
- **memory-delete**: Deletes record \`id\` → outputs \`success\`, \`deleted\`

Other collection tools available to you: get_collection, update_collection, list_collections, delete_collection. Use list_collections to check for an existing collection before creating a new one.

## Workspaces

Agents and memory collections are grouped into workspaces. Scoping is automatic - you never pass a workspace ID:
- Agents and collections you create are placed in the current workspace (or have no workspace if there is none)
- Collection names are resolved inside the running agent's workspace first, then fall back to global (workspace-less) collections
- So the same collection name can exist in different workspaces. Use list_collections to see what this workspace can access before creating a new one, and reuse an existing collection when it fits
- An agent that uses a collection must live in the same workspace as that collection, or the collection must be global

## Common Mistakes to Avoid

**CRITICAL**: These errors will break the workflow. Always check before creating:

1. **Referencing undefined nodes** - Every \`{{node:some-id.path}}\` MUST have a corresponding node with that ID
   - BAD: Using \`{{node:http-1.response}}\` without an \`http-1\` node
   - GOOD: First create the node, then reference it

2. **Invalid model names** - Only use models from the "Valid LLM Models" list above
   - BAD: \`"model": "gpt-4.1"\`, \`"model": "gpt-5"\`, \`"model": "claude-4"\`
   - GOOD: \`"model": "gpt-4o"\`, \`"model": "gpt-4o-mini"\`, \`"model": "claude-sonnet-4-20250514"\`

3. **Disconnected nodes** - Every node should either be an input, or consume another node's output
   - BAD: Branch node without \`input\` field, nodes with outputs nobody uses
   - GOOD: Branch with \`"input": "{{node:previous.output}}"\`, outputs connected to next nodes

4. **Templates inside prompts as strings** - LLM won't interpolate templates it generates at runtime
   - BAD: systemPrompt that tells LLM to use \`{{node:id.path}}\` syntax
   - GOOD: Templates in node.data fields are resolved before execution

5. **Missing required fields** - Each node type has required fields
   - Branch needs: \`branches\` (and usually \`input\`); every id in \`branches[].nodes\` must exist
   - HTTP needs: \`url\`
   - LLM needs: \`provider\`, \`model\`, \`userPrompt\` (or systemPrompt)
   - Agent needs: \`agentId\`; \`inputs\` must cover the target agent's required input fields
   - Memory store needs: \`collection\`, \`data\` (fields go inside \`data\`, not at the root)

7. **Unsupported node types** - Only use: ${SUPPORTED_NODE_TYPES}. There is no \`if-else\` node; use \`branch\`.

6. **Adding parameters to builtin tools** - Builtin tools have predefined schemas
   - BAD: \`{ "type": "builtin", "name": "memory_search", "parameters": { "collection": "..." } }\`
   - GOOD: \`{ "type": "builtin", "name": "memory_search" }\` (no parameters field!)
   - Only agent tools need a \`parameters\` field

## Workflow Validation Checklist

Before creating any agent, mentally verify:

1. [ ] **All referenced nodes exist** - For each \`{{node:X.path}}\`, is there a node with id "X"?
2. [ ] **Model names are valid** - Check against the "Valid LLM Models" list
3. [ ] **Data flows continuously** - Can you trace from input → processing → output?
4. [ ] **Branch nodes are complete** - Does each branch node have an \`input\` and do all \`branches[].nodes\` ids exist?
5. [ ] **No orphan nodes** - Is every node either producing or consuming data?
6. [ ] **Output captures results** - Does the output node reference all final results?
7. [ ] **Builtin tools have no parameters** - \`{ "type": "builtin", "name": "..." }\` only, no \`parameters\` field!`;
