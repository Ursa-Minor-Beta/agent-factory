# Agent Factory

Backend API for building and executing AI agent workflows using a node-graph system.

> **⚠️ Note:** The current version is actively being built. There could be breaking changes.

> **🐳 One shot Docker Deployment:** For a complete deployment with both API and UI, see [agent-factory-docker-api-ui](https://github.com/Ursa-Minor-Beta/agent-factory-docker-api-ui).

## Features

- **Node Graph Workflows** - Define agents as connected nodes
- **Composable Agents** - Agents can call other agents as sub-workflows
- **Multi-Provider LLM** - OpenAI, Anthropic, Ollama
- **Agent Creator** - System agent that builds custom agents through conversation
- **Builtin Tools** - LLM function calling (`create_agent`, `get_agent`, `update_agent`, `update_session_notes`, `append_session_notes`)
- **Multi-User** - JWT auth + API keys
- **Streaming Chat** - Real-time streaming status
- **Encrypted Secrets** - Provider API keys encrypted at rest (AES-256-GCM)
- **File Storage** - Built-in file storage for agent artifacts
- **Swagger Docs** - Full API documentation at `/docs`

## UI Client

A web-based UI client is available at [agent-factory-ui](https://github.com/Ursa-Minor-Beta/agent-factory-ui).

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
| `input` | Workflow entry point with schema |
| `output` | Workflow exit point |
| `llm` | LLM call (OpenAI, Anthropic, Ollama) |
| `http` | HTTP/API requests with SSE streaming support |
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

See http://localhost:3000/docs for full API documentation.

## Licence

Apache 2.0 — see [LICENSE](LICENSE).
