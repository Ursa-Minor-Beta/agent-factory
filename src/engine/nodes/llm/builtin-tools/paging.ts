/**
 * Paging args parsing for builtin list tools
 */

import { DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT } from '../../../tools/paging.js';

export function parsePaging(args: Record<string, unknown>): { skip: number; limit: number } {
  const skip = Math.max(Math.floor(Number(args.skip ?? 0)) || 0, 0);
  const limit = Math.min(Math.max(Math.floor(Number(args.limit ?? DEFAULT_LIST_LIMIT)) || DEFAULT_LIST_LIMIT, 1), MAX_LIST_LIMIT);
  return { skip, limit };
}
