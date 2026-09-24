/**
 * Tools for LLM function calling
 */

// Export types
export type {
  ToolDefinition,
  BuiltinToolDefinition,
  AgentToolDefinition,
  ToolParameters,
} from './types.js';

// Export built-in tools
export { CREATE_AGENT_TOOL } from './create-agent.js';
export { GET_AGENT_TOOL } from './get-agent.js';
export { UPDATE_AGENT_TOOL } from './update-agent.js';
export {
  UPDATE_SESSION_NOTES_TOOL,
  APPEND_SESSION_NOTES_TOOL,
  SESSION_NOTES_TOOLS,
  MAX_SESSION_NOTES_LENGTH,
} from './session-notes.js';
export {
  MEMORY_STORE_TOOL,
  MEMORY_SEARCH_TOOL,
  MEMORY_UPDATE_TOOL,
  MEMORY_DELETE_TOOL,
  MEMORY_TOOLS,
  generateMemoryToolsWithCollections,
} from './memory.js';
export {
  CREATE_COLLECTION_TOOL,
  GET_COLLECTION_TOOL,
  UPDATE_COLLECTION_TOOL,
  LIST_COLLECTIONS_TOOL,
  DELETE_COLLECTION_TOOL,
  COLLECTION_TOOLS,
} from './collection.js';

import { CREATE_AGENT_TOOL } from './create-agent.js';
import { GET_AGENT_TOOL } from './get-agent.js';
import { UPDATE_AGENT_TOOL } from './update-agent.js';
import {
  UPDATE_SESSION_NOTES_TOOL,
  APPEND_SESSION_NOTES_TOOL,
} from './session-notes.js';
import {
  MEMORY_STORE_TOOL,
  MEMORY_SEARCH_TOOL,
  MEMORY_UPDATE_TOOL,
  MEMORY_DELETE_TOOL,
} from './memory.js';
import {
  CREATE_COLLECTION_TOOL,
  GET_COLLECTION_TOOL,
  UPDATE_COLLECTION_TOOL,
  LIST_COLLECTIONS_TOOL,
  DELETE_COLLECTION_TOOL,
} from './collection.js';
import type { BuiltinToolDefinition } from './types.js';

/**
 * All available built-in tools
 */
export const BUILTIN_TOOLS: Record<string, BuiltinToolDefinition> = {
  create_agent: CREATE_AGENT_TOOL,
  get_agent: GET_AGENT_TOOL,
  update_agent: UPDATE_AGENT_TOOL,
  update_session_notes: UPDATE_SESSION_NOTES_TOOL,
  append_session_notes: APPEND_SESSION_NOTES_TOOL,
  memory_store: MEMORY_STORE_TOOL,
  memory_search: MEMORY_SEARCH_TOOL,
  memory_update: MEMORY_UPDATE_TOOL,
  memory_delete: MEMORY_DELETE_TOOL,
  create_collection: CREATE_COLLECTION_TOOL,
  get_collection: GET_COLLECTION_TOOL,
  update_collection: UPDATE_COLLECTION_TOOL,
  list_collections: LIST_COLLECTIONS_TOOL,
  delete_collection: DELETE_COLLECTION_TOOL,
};

/**
 * Get a built-in tool by name
 */
export function getBuiltinTool(name: string): BuiltinToolDefinition | undefined {
  return BUILTIN_TOOLS[name];
}
