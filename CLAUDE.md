# Claude Code Instructions

## Environment Variables

All environment variables should be centralized in `src/config/index.ts`:

```typescript
// Use bracket notation for env access
process.env['VAR_NAME']

// Parse numbers with parseInt and radix 10
parseInt(process.env['VAR_NAME'] ?? 'default', 10)

// Use nullish coalescing for defaults
process.env['VAR_NAME'] ?? 'default-value'
```

Example:
```typescript
export const config = {
  myFeature: {
    timeout: parseInt(process.env['MY_FEATURE_TIMEOUT'] ?? '5000', 10),
    enabled: process.env['MY_FEATURE_ENABLED'] === 'true',
  },
} as const;
```

After adding env vars to config:
1. Update `.env.example` with the new variables
2. Import from `../../config/index.js` in consuming files

## Code Style

- Use `type` imports for TypeScript types: `import type { Foo } from '...'`
- File extensions in imports: `.js` (ESM)
- Prefer `??` over `||` for defaults
- Use `as const` for config objects

## Architecture

### Directory Structure

- Domain entities: `src/domain/entities/`
- Domain services: `src/domain/services/` - Pure business logic, reusable across entry points
- Repository interfaces: `src/domain/interfaces/repositories/`
- MongoDB implementations: `src/infrastructure/database/mongodb/`
- Application services: `src/services/` - Application orchestration (HTTP, sessions, etc.)
- API routes: `src/routes/`
- Engine/workflow: `src/engine/`
- Utilities: `src/utils/`

### Services Pattern

**Domain Services** (`src/domain/services/`):
- Pure business logic functions
- No HTTP, no workflow knowledge
- Reusable across tools, nodes, and routes
- Example: `memory.service.ts`

**Application Services** (`src/services/`):
- Application-level orchestration
- Handle HTTP requests, sessions, external APIs
- Example: `auth.service.ts`, `session.service.ts`

### Memory Architecture

Memory operations use a centralized service layer pattern:

```typescript
// Domain service (business logic)
import * as memoryService from '../domain/services/memory.service.js';

// Used by:
// 1. Builtin tools (LLM-driven)
// 2. Memory nodes (workflow)
// 3. HTTP routes (API)

await memoryService.saveMemoryRecord(userId, collection, data, deps);
```

**Reserved Fields**: Memory records have system-managed fields that cannot be overridden:
- `id`, `schemaId`, `createdAt`, `updatedAt`
- Defined in `MEMORY_RESERVED_FIELDS` (extracted from `MemoryRecordReserved` type)
- Validation happens in `validateMemoryData()`

**Data Structure**: Memory records store user-defined fields at root level:
```typescript
{
  id: "abc123",           // System field
  schemaId: "xyz",        // System field
  createdAt: Date,        // System field
  updatedAt: Date,        // System field
  name: "Alice",          // User field
  email: "alice@...",     // User field
  role: "engineer"        // User field
}
```

### Builtin Tools Organization

Builtin tools are organized by domain in `src/engine/nodes/llm/builtin-tools/`:

```
builtin-tools/
├── index.ts           # Registry & exports
├── types.ts           # Shared ToolHandler type
├── agents.ts          # Agent operations
├── collections.ts     # Memory schema operations
├── memory.ts          # Memory record operations
└── session-notes.ts   # Session notes operations
```

Each domain file exports its handlers, and `index.ts` combines them into a unified registry.
