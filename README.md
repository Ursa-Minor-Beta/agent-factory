# Agent Factory

Backend API for building and executing AI agent workflows. Create, run, and manage AI agents using a node-graph workflow system via REST API.

## Features

- **Node Graph Workflows** - Define agents as connected nodes via API
- **Multi-Provider LLM** - OpenAI, Anthropic, Ollama support
- **Multi-User** - JWT auth + API keys
- **REST API** - Full CRUD with Swagger docs
- **Database Agnostic** - Repository pattern (MongoDB now, PostgreSQL ready)

## Tech Stack

- Node.js + TypeScript
- Fastify
- MongoDB + Mongoose
- Zod validation
- Swagger/OpenAPI docs

## Quick Start

```bash
# Install dependencies
npm install

# Copy env file
cp .env.example .env

# Edit .env with your values
# MONGODB_URI=mongodb://localhost:27017/agent-factory
# ADMIN_EMAIL - Admin login email
# ADMIN_PASSWORD - Admin password (min 8 chars)
# ADMIN_NAME - Display name (default: "Admin")

# Run development server
npm run dev
```

Open http://localhost:3000/docs for API documentation.

## First Run

On first startup, the server automatically creates:

### Admin User
Created from environment variables (required):
- `ADMIN_EMAIL` - Admin login email
- `ADMIN_PASSWORD` - Admin password (min 8 chars)
- `ADMIN_NAME` - Display name (default: "Admin")

### Default Agent
A simple `Input → LLM → Output` workflow:
```
[Input: text] → [LLM: gpt-4o-mini] → [Output]
```

This agent accepts a `text` input and passes it to OpenAI's GPT-4o-mini model.

**Note**: To run the default agent, configure an OpenAI provider via `/api/providers`.

## Usage

### 1. Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "your-secure-password"}'
```

Response:
```json
{
  "success": true,
  "data": {
    "user": { "id": "...", "email": "admin@example.com", "name": "Admin", "role": "admin" },
    "tokens": { "accessToken": "eyJ...", "refreshToken": "eyJ..." }
  }
}
```

### 2. Create OpenAI Provider

```bash
curl -X POST http://localhost:3000/api/providers \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <accessToken>" \
  -d '{
    "provider": "openai",
    "name": "My OpenAI",
    "isDefault": true,
    "config": { "apiKey": "sk-..." }
  }'
```

### 3. Run Default Agent

Get the agent ID from server logs or list agents:
```bash
curl http://localhost:3000/api/agents \
  -H "Authorization: Bearer <accessToken>"
```

Run the agent:
```bash
curl -X POST http://localhost:3000/api/agents/<agentId>/run \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <accessToken>" \
  -d '{"input": {"text": "Hello, how are you?"}}'
```

Response:
```json
{
  "success": true,
  "data": {
    "id": "...",
    "status": "completed",
    "output": { "value": "I'm doing well, thank you for asking!..." }
  }
}
```

## Node Types

| Type | Description | Inputs | Outputs |
|------|-------------|--------|---------|
| `input` | Workflow entry point | - | `*` (schema fields) |
| `output` | Workflow exit point | `value` | - |
| `llm` | LLM call (OpenAI, Anthropic, Ollama) | `prompt`, `context` | `response`, `usage` |
| `http` | HTTP request | `body`, `params` | `response`, `status` |
| `js` | Custom JavaScript code | `input` | `output` |
| `agent` | Execute sub-agent | `input` | `output` |
| `if-else` | Conditional branching | `input` | `true`, `false`, `result` |

### If-Else Node Example

```json
{
  "id": "condition-1",
  "type": "if-else",
  "data": {
    "expression": "input.score > 0.5"
  }
}
```

The expression has access to the `input` variable. Nodes connected to the `true` output run when condition is true, nodes connected to `false` output run otherwise.

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

# Admin (REQUIRED - server won't start without these)
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=your-secure-password
ADMIN_NAME=Admin
```

## Scripts

```bash
npm run dev      # Development with hot reload
npm run build    # Build for production
npm run start    # Run production build
npm run lint     # Run ESLint
```

## License

MIT
