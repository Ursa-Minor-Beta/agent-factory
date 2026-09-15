import type { Run, NodeState } from '../domain/entities/Run.js';

/**
 * Check if a value is a nodeRef reference
 * Format: "nodeRef:<nodeId>:<handle>"
 */
export function isNodeRef(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('nodeRef:');
}

/**
 * Parse a nodeRef reference
 * Returns { nodeId, handle } or null if invalid
 */
export function parseNodeRef(ref: string): { nodeId: string; handle: string } | null {
  const match = ref.match(/^nodeRef:([^:]+):(.+)$/);
  if (!match || !match[1] || !match[2]) return null;
  return { nodeId: match[1], handle: match[2] };
}

/**
 * Resolve a single nodeRef to its actual value from nodeStates
 */
export function resolveNodeRef(ref: string, nodeStates: Record<string, NodeState>): unknown {
  const parsed = parseNodeRef(ref);
  if (!parsed) return ref;

  const nodeState = nodeStates[parsed.nodeId];
  if (!nodeState || !nodeState.output) return undefined;

  // Handle nested handle paths like "value.something"
  const output = nodeState.output as Record<string, unknown>;
  return output[parsed.handle];
}

/**
 * Resolve all nodeRefs in run.output to their actual values
 */
export function resolveRunOutput(run: Run): Record<string, unknown> {
  if (!run.output) return {};

  const resolved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(run.output)) {
    if (isNodeRef(value)) {
      resolved[key] = resolveNodeRef(value, run.nodeStates);
    } else {
      resolved[key] = value;
    }
  }
  return resolved;
}
