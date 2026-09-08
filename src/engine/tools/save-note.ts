/**
 * save_note - Built-in tool for saving important notes during conversations
 */

import type { BuiltinToolDefinition } from './types.js';

export const SAVE_NOTE_TOOL: BuiltinToolDefinition = {
  type: 'builtin',
  name: 'save_note',
  description:
    'Save important notes about the conversation that should be remembered across messages. Use this to store key facts, user preferences, decisions made, or any information that would be useful in future turns of the conversation.',
  parameters: {
    type: 'object',
    properties: {
      notes: {
        type: 'string',
        description:
          'The notes to save. Include all important information in a structured format.',
      },
    },
    required: ['notes'],
  },
};
