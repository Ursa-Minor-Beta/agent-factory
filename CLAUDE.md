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

- Domain entities: `src/domain/entities/`
- Repository interfaces: `src/domain/interfaces/repositories/`
- MongoDB implementations: `src/infrastructure/database/mongodb/`
- API routes: `src/routes/`
- Engine/workflow: `src/engine/`
- Utilities: `src/utils/`
