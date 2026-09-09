# Agent Factory

Backend API for building and executing AI agent workflows using a node-graph system.

## Features

- **Node Graph Workflows** - Define agents as connected nodes
- **Multi-Provider LLM** - OpenAI, Anthropic, Ollama
- **Agent Creator** - System agent that builds custom agents through conversation
- **Builtin Tools** - LLM function calling (`save_note`, `create_agent`)
- **Multi-User** - JWT auth + API keys
- **Encrypted Secrets** - Provider API keys encrypted at rest (AES-256-GCM)
- **Swagger Docs** - Full API documentation at `/docs`

## Quick Start

### Local Development
```bash
npm install
cp .env.example .env
# Edit .env with your values
npm run dev
```

### Docker
```bash
cp .env.example .env
# Edit .env with your values
docker-compose up -d
```

Open http://localhost:3000/docs for full API documentation.

## First Run

On startup, the server creates:
- **Admin user** from `ADMIN_EMAIL` / `ADMIN_PASSWORD` env vars
- **Agent Creator** - System agent for building custom agents
- **Test agents** - For verification (no external APIs needed)
- **Default agent** - Simple `Input → LLM → Output` workflow

## Environment Variables

```bash
# Server
PORT=3000
HOST=0.0.0.0
NODE_ENV=development

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
```

## Node Types

| Type | Description |
|------|-------------|
| `input` | Workflow entry point with schema |
| `output` | Workflow exit point |
| `llm` | LLM call (OpenAI, Anthropic, Ollama) |
| `http` | HTTP/API requests |
| `js` | JavaScript code execution |
| `agent` | Execute sub-agent |
| `if-else` | Conditional branching |

Get full node documentation: `GET /api/nodes`

## Scripts

```bash
npm run dev      # Development with hot reload
npm run build    # Build for production
npm run start    # Run production build
npm run lint     # Run ESLint
```

## Usage

### 1. Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "your-secure-password"}'
```

### 2. Create API Key (Optional)

For programmatic access, create an API key instead of using JWT tokens:

```bash
curl -X POST http://localhost:3000/api/auth/api-keys \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <accessToken>" \
  -d '{
    "name": "My API Key",
    "permissions": ["agents:read", "agents:write" ]
  }'
```

**Save the `plainKey`** - it's only shown once!

Use `X-API-Key` header for subsequent requests:
```bash
curl http://localhost:3000/api/agents -H "X-API-Key: af_live_abc123..."
```

### 3. Configure LLM Provider

```bash
curl -X POST http://localhost:3000/api/providers \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <accessToken>" \
  -d '{"provider": "openai", "name": "My OpenAI", "isDefault": true, "config": {"apiKey": "sk-..."}}'
```

Provider API keys are encrypted at rest using AES-256-GCM.

### 4. Run an Agent

Single execution:
```bash
curl -X POST http://localhost:3000/api/agents/<agentId>/run \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <accessToken>" \
  -d '{"input": {"text": "Hello, how are you?"}}'
```


### 6. Create Custom Agents

**Option A: Via Agent Creator (Recommended)**

Chat with the Agent Creator system agent:
```bash
# Create session with Agent Creator
curl -X POST http://localhost:3000/api/sessions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <accessToken>" \
  -d '{"agentId": "<agentCreatorId>", "title": "Create my agent"}'

# Describe what you want
curl -X POST http://localhost:3000/api/sessions/<sessionId>/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <accessToken>" \
  -d '{"content": "Create an agent that summarizes web articles"}'
```

The Agent Creator will:
1. Ask clarifying questions about your requirements
2. Suggest features and improvements
3. Build the workflow with appropriate nodes
4. Create the agent using the `create_agent` tool

**Option B: Via API**

```bash
curl -X POST http://localhost:3000/api/agents \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <accessToken>" \
  -d '{
    "name": "My Agent",
    "description": "Does something useful",
    "nodes": [...],
    "edges": [...]
  }'
```


### Template Interpolation

LLM and HTTP nodes support `{{variable}}` template syntax:
```json
{
  "type": "llm",
  "data": {
    "systemPrompt": "You are a {{role}} assistant.",
    "userPrompt": "{{userMessage}}"
  }
}
```

## Builtin Tools

LLM nodes can use builtin tools for function calling:

### save_note
Saves important information to session notes (persisted across messages):
```json
{
  "tools": [{ "type": "builtin", "name": "save_note" }]
}
```

### create_agent
Creates a new agent with a custom workflow:
```json
{
  "tools": [{ "type": "builtin", "name": "create_agent" }]
}
```

## License

MIT
