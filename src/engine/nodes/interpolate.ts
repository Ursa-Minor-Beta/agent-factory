import type { ExecutionContext } from '../context.js';


/**
 * Regex pattern to find node references: {{node:<id>.path}}
 */
export const NODE_PATTERN = /\{\{node:([^.}]+)\.([^}]+)\}\}/g;

/**
 * Regex pattern to find secret references: {{secret:KEY_NAME}}
 */
export const SECRET_PATTERN = /\{\{secret:(\w+)\}\}/g;


/**
 * Get a nested value from an object using dot notation path
 * e.g., getByPath(obj, 'response.result.data') => obj.response.result.data
 */
function getByPath(obj: unknown, path: string): unknown {
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
 * Options for interpolation functions
 */
export interface InterpolateOptions {
  /** Resolved secrets */
  secrets?: Record<string, string>;
  /** Execution context for resolving {{node:id.path}} references */
  context?: ExecutionContext;
}

/**
 * Interpolate a single string template.
 *
 * Supports:
 * - {{node:nodeId.path.to.value}} - Reference output from another node
 * - {{secret:KEY}} - Reference a secret value
 *
 * @example
 * interpolate('Result: {{node:llm-1.response}}', { context })
 * interpolate('Bearer {{secret:API_KEY}}', { secrets })
 */
export function interpolate(template: string, options: InterpolateOptions = {}): string {
  const { secrets = {}, context } = options;
  let result = template;

  // 1. Handle {{node:nodeId.path}} pattern - reference other node outputs
  result = result.replace(NODE_PATTERN, (match, nodeId, path) => {
    if (!context) {
      return match;
    }

    const nodeOutputs = context.getNodeOutputs(nodeId);
    if (!nodeOutputs || Object.keys(nodeOutputs).length === 0) {
      return match;
    }

    const value = getByPath(nodeOutputs, path);
    if (value === undefined) {
      return match;
    }

    return formatValue(value);
  });

  // 2. Handle {{secret:KEY}} pattern
  result = result.replace(SECRET_PATTERN, (match, key) => {
    const value = secrets[key];
    if (value === undefined) {
      return match;
    }
    return value;
  });

  return result;
}

/**
 * Recursively interpolate all string values in any data structure.
 * Supports nested objects and arrays.
 *
 * @example
 * interpolateDeep('Hello {{node:input.name}}', { context })
 * // => 'Hello John'
 *
 * interpolateDeep(['{{node:a.out}}', '{{node:b.out}}'], { context })
 * // => [resolvedA, resolvedB]
 *
 * interpolateDeep({ items: ['{{node:a.out}}'] }, { context })
 * // => { items: [resolvedA] }
 */
export function interpolateDeep<T>(value: T, options: InterpolateOptions = {}): T {
  if (typeof value === 'string') {
    const interpolated = interpolate(value, options);
    // Try to parse JSON strings (e.g., when node output was an object)
    try {
      return JSON.parse(interpolated) as T;
    } catch {
      return interpolated as T;
    }
  }
  if (Array.isArray(value)) {
    return value.map((item) => interpolateDeep(item, options)) as T;
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = interpolateDeep(v, options);
    }
    return result as T;
  }
  return value;
}

// Backward compatibility alias
export { interpolate as interpolateAll };
