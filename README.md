# Agent Factory

Backend API for building and executing AI agent workflows using a node-graph system.

> **⚠️ Note:** The current version is actively being built. There could be breaking changes.

> **💻 UI:** A web-based UI client is available at [agent-factory-ui](https://github.com/Ursa-Minor-Beta/agent-factory-ui).

> **🐳 One shot Docker Deployment:** For a complete deployment with both API and UI, see [agent-factory-docker-api-ui](https://github.com/Ursa-Minor-Beta/agent-factory-docker-api-ui).

## Features

- **Node Graph Workflows** - Define agents as connected nodes
- **Composable Agents** - Agents can call other agents as sub-workflows or llm-tools
- **Multi-Provider LLM** - Anthropic, OpenAI, Ollama, DeepSeek, Groq, Mistral, OpenRouter, Together AI, xAI, plus any OpenAI-compatible endpoint (vLLM, LM Studio, LiteLLM, ...) via custom `baseUrl`
- **Agent Creator** - System agent that builds custom agents through conversation
- **Memory System** - Persistent storage with collections, schemas, and CRUD operations
- **Builtin Tools** - LLM function calling for agents, memory, collections, and session notes
  - Agent tools: `create_agent`, `get_agent`, `update_agent`
  - Memory tools: `memory_store`, `memory_search`, `memory_update`, `memory_delete`
  - Collection tools: `create_collection`, `get_collection`, `update_collection`, `list_collections`, `delete_collection`
  - Session tools: `update_session_notes`, `append_session_notes`
- **Multi-User** - JWT auth + API keys
- **Workspaces** - Organize agents, secrets, collections, and providers into isolated workspaces
- **Streaming Chat** - Real-time streaming status
- **Agent Schedules** - Run agents automatically: `cron` (5-field, or 6-field with leading seconds at least 10s apart, + `@daily`/`@weekly`/..., timezone-aware, optional `startAt`/`endAt`/`maxRuns`), `once` at a date, or fixed `interval`
  - `sessionMode: "session"` keeps all runs in one chat session (visible in chat UI; recreated if deleted, or continue an existing `sessionId`), `"incognito"` stores only the run
  - Overlap policy (`skip`/`allow`), auto-disable via `stopAfterFailures`, run-now, and upcoming-runs preview
  - Scheduled runs are tagged `triggeredBy.triggerType = "schedule"` and filterable in `/api/executions?scheduleId=...`
- **Encrypted Secrets** - Provider API keys and secrets encrypted at rest (AES-256-GCM), referenced in nodes as `{{secret:KEY}}`
- **Variables** - Plain-text, user-defined values (global or per workspace) usable in any node input as `{{var:KEY}}`
- **File Storage** - Built-in file storage for agent artifacts
- **Export/Import** - Export agents to JSON, import from file
- **GitHub Sync** - Link agents to GitHub repos with push/pull support
- **Agent Snapshots** - Version history with restore capability
- **Swagger Docs** - Full API documentation at `/docs`

## Environment Variables

```bash
# Server
PORT=3000
HOST=0.0.0.0
NODE_ENV=development

# CORS (optional - leave empty to allow all origins)
ALLOWED_ORIGINS=http://localhost:3000

# MongoDB
MONGODB_URI=mongodb://localhost:27017/agent-factory

# JWT
JWT_SECRET=your-secret-key
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Encryption (for provider API keys)
# Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_KEY=your-32-byte-hex-key

# Admin (REQUIRED)
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=your-secure-password
ADMIN_NAME=Admin

# Agent Versions (optional)
AGENT_MAX_SNAPSHOTS=50  # Maximum snapshots per agent (default: 50)

# Workflow Engine (optional)
ENGINE_DEFAULT_PARALLEL_NODES=2  # Default max nodes run in parallel per run, 1 = sequential (default: 2)
LLM_CLIENT_TOOL_TIMEOUT_MS=60000  # How long a run waits for the UI to answer a client tool call (default: 60000)

# Agent Scheduler (optional)
SCHEDULER_POLL_INTERVAL_MS=15000    # Max delay between checks for due schedules (default: 15000)
SCHEDULER_MAX_CONCURRENT_RUNS=3     # Max scheduled runs executing at the same time (default: 3)
```

## Quick Start

### Local Development
```bash
npm install
cp .env.example .env
# Edit .env with your values, set at least MONGODB_URI, ADMIN_EMAIL, ADMIN_PASSWORD
npm run dev
```

### Or Docker

#### Full stack (app + MongoDB)
```bash
cp .env.example .env
# Edit .env with your values, set at least ADMIN_EMAIL, ADMIN_PASSWORD

docker-compose --profile local-db up -d

# Rebuild after code changes
docker-compose --profile local-db up -d --build
```

#### App only (set external MONGODB_URI in .env)
```bash
cp .env.example .env
# Edit .env with your values, set at least MONGODB_URI, ADMIN_EMAIL, ADMIN_PASSWORD

docker-compose up -d

# Rebuild after code changes
docker-compose up -d --build 
```

Open http://localhost:3000/docs for full API documentation.

## First Run

On startup, the server creates:
- **Admin user** from `ADMIN_EMAIL` / `ADMIN_PASSWORD` env vars
- **Agent Creator** - System agent for building custom agents
- **Default agent** - Simple `Input → LLM → Output` workflow


## Node Types

| Type | Description |
|------|-------------|
| `input` | Workflow entry point with schema (field types: `string`, `number`, `boolean`, `enum` with predefined `options`) |
| `output` | Workflow exit point |
| `llm` | LLM call (OpenAI, Anthropic, Ollama) |
| `http` | HTTP/API requests with SSE streaming support |
| `js` | JavaScript code execution |
| `agent` | Execute sub-agent |
| `branch` | Conditional branching (if-else) |
| `memory-store` | Store data in memory collection |
| `memory-search` | Search/retrieve memory records |
| `memory-update` | Update existing memory records |
| `memory-delete` | Delete memory records |

Get full node documentation: `GET /api/nodes`

## Workspace Scoping

Workspaces provide isolation for organizing resources. Secrets, variables, collections (memory schemas), and provider configurations can be scoped to a workspace or kept global.

### Scope Resolution

When an agent runs, it has access to:
- **Global resources** (no workspaceId) - Available to all agents
- **Workspace resources** - Only available to agents in that workspace

If the same name exists in both scopes, **workspace takes precedence** over global.

Sub-agents (Agent node or agent tool calls) always run with **their own** workspace scope, not the caller's: an agent in workspace A calling an agent in workspace B gets B's secrets, variables and collections (plus global). Agents without a workspace get global resources only.


## Scripts

```bash
npm run dev      # Development with hot reload
npm run build    # Build for production
npm run start    # Run production build
npm run lint     # Run ESLint
```

## Usage

### Authentication

**Login**
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "your-password"}'

# Use token in requests
curl http://localhost:3000/api/agents -H "Authorization: Bearer <accessToken>"
```

**Option: create API Key**
```bash
# Create API key (one-time)
curl -X POST http://localhost:3000/api/auth/api-keys \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"name": "My Key"}'

# Use in requests
curl http://localhost:3000/api/agents -H "X-API-Key: af_live_..."
```

**Option: use httpOnly cookies (for browsers)**
```bash
# Login sets cookies automatically
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "...", "password": "..."}' \
  -c cookies.txt

# Cookies sent automatically
curl http://localhost:3000/api/agents -b cookies.txt

# Logout clears cookies
curl -X POST http://localhost:3000/api/auth/logout -b cookies.txt -c cookies.txt
```

### Configure LLM Provider

```bash
curl -X POST http://localhost:3000/api/providers \
  -H "X-API-Key: af_live_..." \
  -H "Content-Type: application/json" \
  -d '{"provider": "openai", "name": "OpenAI", "isDefault": true, "config": {"apiKey": "sk-..."}}'
```

### Chat with Agent by id

```bash
# Start conversation (auto-creates session)
curl -X POST http://localhost:3000/api/agents/:id/chat \
  -H "X-API-Key: af_live_..." \
  -H "Content-Type: application/json" \
  -d '{"message": "Hi!"}'

# Continue conversation
curl -X POST http://localhost:3000/api/agents/:id/chat \
  -H "X-API-Key: af_live_..." \
  -H "Content-Type: application/json" \
  -d '{"message": "Add error handling", "sessionId": "<sessionId>"}'
```

### Chat with Agent Creator

```bash
# Start conversation (auto-creates session)
curl -X POST http://localhost:3000/api/agents/agent-creator/chat \
  -H "X-API-Key: af_live_..." \
  -H "Content-Type: application/json" \
  -d '{"message": "Create an agent that summarizes articles"}'

# Continue conversation
curl -X POST http://localhost:3000/api/agents/agent-creator/chat \
  -H "X-API-Key: af_live_..." \
  -H "Content-Type: application/json" \
  -d '{"message": "Add error handling", "sessionId": "<sessionId>"}'
```

### Schedule an Agent

```bash
# Every weekday at 09:00 Berlin time, continuing one chat session
curl -X POST http://localhost:3000/api/schedules \
  -H "X-API-Key: af_live_..." \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "<agentId>",
    "name": "Morning digest",
    "trigger": { "type": "cron", "expression": "0 9 * * mon-fri" },
    "timezone": "Europe/Berlin",
    "input": { "message": "Summarize yesterday" },
    "sessionMode": "session",
    "stopAfterFailures": 5
  }'

# Other triggers
#   { "type": "once", "at": "2026-12-24T10:00:00Z" }
#   { "type": "interval", "everyMs": 5400000, "anchorAt": "2026-11-10T08:00:00Z" }

# Preview next run times, run now, list scheduled runs
curl -X POST http://localhost:3000/api/schedules/preview -H "X-API-Key: af_live_..." -H "Content-Type: application/json" \
  -d '{"trigger": {"type": "cron", "expression": "0 0 1 * *"}, "timezone": "UTC", "count": 3}'
curl -X POST http://localhost:3000/api/schedules/<id>/run -H "X-API-Key: af_live_..."
curl "http://localhost:3000/api/executions?scheduleId=<id>" -H "X-API-Key: af_live_..."
```

See http://localhost:3000/docs for full API documentation.

## Licence

Apache 2.0 — see [LICENSE](LICENSE).
