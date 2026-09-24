/**
 * Session notes builtin tool handlers
 */

import { MAX_SESSION_NOTES_LENGTH } from '../../../tools/session-notes.js';
import type { ToolHandler } from './types.js';

/**
 * Handle update_session_notes tool
 */
export const handleUpdateSessionNotes: ToolHandler = async (args, options) => {
  const maxLength = options.maxNotesLength ?? MAX_SESSION_NOTES_LENGTH;
  let notes = String(args.notes ?? '');
  const wasTruncated = notes.length > maxLength;
  if (wasTruncated) {
    notes = notes.slice(0, maxLength);
  }
  if (options.onSessionNotesUpdate) {
    await options.onSessionNotesUpdate(notes);
  }
  return {
    success: true,
    message: wasTruncated
      ? `Session notes updated (truncated from ${String(args.notes).length} to ${maxLength} chars)`
      : 'Session notes updated',
    length: notes.length,
    maxLength,
  };
};

/**
 * Handle append_session_notes tool
 */
export const handleAppendSessionNotes: ToolHandler = async (args, options) => {
  const maxLength = options.maxNotesLength ?? MAX_SESSION_NOTES_LENGTH;
  const toAppend = String(args.notes ?? '');
  const current = options.sessionNotes ?? '';
  let newNotes = current ? `${current}\n${toAppend}` : toAppend;
  const wasTruncated = newNotes.length > maxLength;
  if (wasTruncated) {
    newNotes = newNotes.slice(0, maxLength);
  }
  if (options.onSessionNotesUpdate) {
    await options.onSessionNotesUpdate(newNotes);
  }
  return {
    success: true,
    message: wasTruncated
      ? `Notes appended but truncated to ${maxLength} chars`
      : 'Notes appended',
    length: newNotes.length,
    maxLength,
  };
};
