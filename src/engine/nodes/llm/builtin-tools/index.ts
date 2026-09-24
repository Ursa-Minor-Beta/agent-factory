/**
 * Builtin tool handlers registry
 * Organizes tool handlers by domain for better maintainability
 */

import type { ExecutionOptions } from '../../base.js';
import type { ToolHandler } from './types.js';

// Import handlers by domain
import {
  handleCreateAgent,
  handleGetAgent,
  handleUpdateAgent,
} from './agents.js';

import {
  handleUpdateSessionNotes,
  handleAppendSessionNotes,
} from './session-notes.js';

import {
  handleCreateCollection,
  handleGetCollection,
  handleUpdateCollection,
  handleListCollections,
  handleDeleteCollection,
} from './collections.js';

import {
  handleMemoryStore,
  handleMemorySearch,
  handleMemoryUpdate,
  handleMemoryDelete,
} from './memory.js';

/**
 * Registry of all builtin tool handlers
 */
const builtinToolHandlers: Record<string, ToolHandler> = {
  // Agent tools
  create_agent: handleCreateAgent,
  get_agent: handleGetAgent,
  update_agent: handleUpdateAgent,

  // Session notes tools
  update_session_notes: handleUpdateSessionNotes,
  append_session_notes: handleAppendSessionNotes,

  // Collection tools
  create_collection: handleCreateCollection,
  get_collection: handleGetCollection,
  update_collection: handleUpdateCollection,
  list_collections: handleListCollections,
  delete_collection: handleDeleteCollection,

  // Memory tools
  memory_store: handleMemoryStore,
  memory_search: handleMemorySearch,
  memory_update: handleMemoryUpdate,
  memory_delete: handleMemoryDelete,
};

/**
 * Execute a builtin tool by name
 */
export async function executeBuiltinTool(
  toolName: string,
  args: Record<string, unknown>,
  options: ExecutionOptions
): Promise<unknown> {
  const handler = builtinToolHandlers[toolName];
  if (!handler) {
    throw new Error(`Unknown builtin tool: ${toolName}`);
  }
  return handler(args, options);
}

// Re-export the type
export type { ToolHandler } from './types.js';
