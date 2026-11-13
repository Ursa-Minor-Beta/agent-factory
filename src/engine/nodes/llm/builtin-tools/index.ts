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
  handleListAgents,
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

import {
  handleListSchedules,
  handleGetSchedule,
  handleCreateSchedule,
  handleUpdateSchedule,
  handleDeleteSchedule,
} from './schedules.js';

import {
  handleListWebhookTemplates,
  handleListWebhooks,
  handleGetWebhook,
  handleCreateWebhook,
  handleUpdateWebhook,
  handleDeleteWebhook,
  handleTestWebhook,
} from './webhooks.js';

/**
 * Registry of all builtin tool handlers
 */
const builtinToolHandlers: Record<string, ToolHandler> = {
  // Agent tools
  create_agent: handleCreateAgent,
  get_agent: handleGetAgent,
  list_agents: handleListAgents,
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

  // Schedule tools
  list_schedules: handleListSchedules,
  get_schedule: handleGetSchedule,
  create_schedule: handleCreateSchedule,
  update_schedule: handleUpdateSchedule,
  delete_schedule: handleDeleteSchedule,

  // Webhook tools
  list_webhook_templates: handleListWebhookTemplates,
  list_webhooks: handleListWebhooks,
  get_webhook: handleGetWebhook,
  create_webhook: handleCreateWebhook,
  update_webhook: handleUpdateWebhook,
  delete_webhook: handleDeleteWebhook,
  test_webhook: handleTestWebhook,
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
