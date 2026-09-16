/**
 * Session notes tools - allow LLM to persist important context
 */

import type { BuiltinToolDefinition } from './types.js';

/** Maximum length for session notes (in characters) */
export const MAX_SESSION_NOTES_LENGTH = 8000;

/**
 * Tool to replace session notes entirely
 */
export const UPDATE_SESSION_NOTES_TOOL: BuiltinToolDefinition = {
  type: 'builtin',
  name: 'update_session_notes',
  description:
    `Replace session notes with new content. Use this to store important user information, IDs, requirements, task context, or any data that must persist across the conversation. The notes survive even when older messages are truncated. Max ${MAX_SESSION_NOTES_LENGTH} characters (will be truncated if exceeded).`,
  parameters: {
    type: 'object',
    properties: {
      notes: {
        type: 'string',
        description: `The complete notes content to store (max ${MAX_SESSION_NOTES_LENGTH} chars)`,
      },
    },
    required: ['notes'],
  },
};

/**
 * Tool to append to existing session notes
 */
export const APPEND_SESSION_NOTES_TOOL: BuiltinToolDefinition = {
  type: 'builtin',
  name: 'append_session_notes',
  description:
    `Append new content to existing session notes without replacing them. Use this to incrementally add important information. Total notes limited to ${MAX_SESSION_NOTES_LENGTH} characters.`,
  parameters: {
    type: 'object',
    properties: {
      notes: {
        type: 'string',
        description: 'Content to append to existing notes',
      },
    },
    required: ['notes'],
  },
};

/**
 * Both session notes tools for easy inclusion
 */
export const SESSION_NOTES_TOOLS: BuiltinToolDefinition[] = [
  UPDATE_SESSION_NOTES_TOOL,
  APPEND_SESSION_NOTES_TOOL,
];
