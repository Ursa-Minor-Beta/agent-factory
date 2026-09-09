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

```bash
npm install
cp .env.example .env
# Edit .env with your values
npm run dev
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

## License

MIT
