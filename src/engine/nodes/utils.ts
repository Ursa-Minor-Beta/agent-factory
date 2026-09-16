import type { ExecutionContext } from '../context.js';

/**
 * Get a nested value from an object using dot notation path
 * e.g., getByPath(obj, 'response.result.data') => obj.response.result.data
 */
export function getByPath(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return current;
}

/**
 * Format a value for template substitution
 */
function formatValue(value: unknown): string {
  if (value === undefined) return '';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

/**
 * Interpolation options for interpolateAll
 */
export interface InterpolateOptions {
  /** Resolved secrets */
  secrets?: Record<string, string>;
  /** Execution context for resolving {{node:id.path}} references */
  context?: ExecutionContext;
}

/**
 * Universal template interpolation with support for:
 * - {{node:nodeId.path.to.value}} - Reference output from another node (standard pattern)
 * - {{secret:KEY}} - Reference a secret value
 *
 * For workflow inputs, use {{node:input-1.fieldName}} (standard pattern)
 *
 * @example
 * // Reference another node's output
 * interpolateAll('Result: {{node:llm-1.response}}', { context })
 *
 * // Reference workflow input
 * interpolateAll('Message: {{node:input-1.message}}', { context })
 *
 * // Reference a secret
 * interpolateAll('Bearer {{secret:API_KEY}}', { secrets })
 */
export function interpolateAll(template: string, options: InterpolateOptions = {}): string {
  const { secrets = {}, context } = options;
  let result = template;

  // 1. Handle {{node:nodeId.path}} pattern - reference other node outputs
  result = result.replace(/\{\{node:([^.}]+)\.([^}]+)\}\}/g, (match, nodeId, path) => {
    if (!context) {
      // No context available, leave unresolved
      return match;
    }

    const nodeOutputs = context.getNodeOutputs(nodeId);
    if (!nodeOutputs || Object.keys(nodeOutputs).length === 0) {
      // Node not found or no outputs yet
      return match;
    }

    const value = getByPath(nodeOutputs, path);
    if (value === undefined) {
      return match;
    }

    return formatValue(value);
  });

  // 2. Handle {{secret:KEY}} pattern
  result = result.replace(/\{\{secret:(\w+)\}\}/g, (match, key) => {
    const value = secrets[key];
    if (value === undefined) {
      // Leave unresolved if secret not found
      return match;
    }
    return value;
  });

  return result;
}
