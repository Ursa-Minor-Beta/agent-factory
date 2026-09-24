import type { ExecutionOptions } from '../../base.js';

/**
 * Tool handler function signature
 */
export type ToolHandler = (
  args: Record<string, unknown>,
  options: ExecutionOptions
) => Promise<unknown>;
