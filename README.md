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

### 2. Create API Key (Optional)

For programmatic access, create an API key instead of using JWT tokens:

```bash
curl -X POST http://localhost:3000/api/auth/api-keys \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <accessToken>" \
  -d '{
    "name": "My API Key",
    "permissions": ["agents:read", "agents:write", "agents:run", "runs:read"]
  }'
```

Response:
```json
{
  "success": true,
  "data": {
    "apiKey": { "id": "...", "name": "My API Key", "keyPrefix": "af_live_" },
    "plainKey": "af_live_abc123..."
  }
}
```

**Save the `plainKey`** - it's only shown once!

Now use `X-API-Key` header instead of `Authorization: Bearer`:
```bash
curl http://localhost:3000/api/agents \
  -H "X-API-Key: af_live_abc123..."
```

### 3. Create OpenAI Provider

Use either JWT token or API key for authentication:

```bash
# With JWT token
curl -X POST http://localhost:3000/api/providers \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <accessToken>" \
  -d '{"provider": "openai", "name": "My OpenAI", "isDefault": true, "config": {"apiKey": "sk-..."}}'

# With API key
curl -X POST http://localhost:3000/api/providers \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <your-api-key>" \
  -d '{"provider": "openai", "name": "My OpenAI", "isDefault": true, "config": {"apiKey": "sk-..."}}'
```

### 4. Run Default Agent

Get the agent ID from server logs or list agents:
```bash
# With JWT token
curl http://localhost:3000/api/agents -H "Authorization: Bearer <accessToken>"

# With API key
curl http://localhost:3000/api/agents -H "X-API-Key: <your-api-key>"
```

Run the agent:
```bash
# With JWT token
curl -X POST http://localhost:3000/api/agents/<agentId>/run \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <accessToken>" \
  -d '{"input": {"text": "Hello, how are you?"}}'

# With API key
curl -X POST http://localhost:3000/api/agents/<agentId>/run \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <your-api-key>" \
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

Get available node types with full documentation:

```bash
curl http://localhost:3000/api/nodes
```

Returns node definitions including:
- `type` - Node type identifier
- `description` - What the node does
- `inputs` / `outputs` - Connection handles
- `options` - Configuration options with types, defaults, descriptions
- `features` - Special capabilities (e.g., template interpolation)
- `examples` - Usage examples with sample configurations

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
