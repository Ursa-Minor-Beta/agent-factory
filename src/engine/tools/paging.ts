/**
 * Shared paging parameters for builtin list tools
 */

export const DEFAULT_LIST_LIMIT = 50;
export const MAX_LIST_LIMIT = 200;

export const PAGING_PARAMETERS = {
  skip: {
    type: 'number',
    description: 'Number of items to skip, for paging (default: 0)',
  },
  limit: {
    type: 'number',
    description: `Maximum number of items to return (default: ${DEFAULT_LIST_LIMIT}, max: ${MAX_LIST_LIMIT})`,
  },
};

/** Appended to list tool descriptions */
export const PAGING_HINT = 'Results are paged: if hasMore is true, call again with skip increased by the number of items received.';
