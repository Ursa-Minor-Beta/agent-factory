import { NodeExecutionError } from '../../utils/errors.js';

/**
 * Replace {{variable}} placeholders with actual values
 * Supports workflow input field names and edge handle names
 * Does NOT support secrets - use interpolateWithSecrets for HTTP nodes
 */
export function interpolate(template: string, values: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = values[key];
    if (value === undefined) return `{{${key}}}`;
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  });
}

/**
 * Replace {{variable}} and {{secret:KEY}} placeholders with actual values
 * Used by HTTP nodes where secrets are allowed (headers, URL, body)
 * Throws NodeExecutionError if a referenced secret is not found
 */
export function interpolateWithSecrets(
  template: string,
  values: Record<string, unknown>,
  secrets: Record<string, string>
): string {
  // First, handle {{secret:KEY}} pattern
  let result = template.replace(/\{\{secret:(\w+)\}\}/g, (_, key) => {
    const value = secrets[key];
    if (value === undefined) {
      throw new NodeExecutionError(
        `Secret "${key}" not found. Please create this secret in your settings.`,
        {}
      );
    }
    return value;
  });

  // Then handle regular {{variable}} pattern
  result = result.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = values[key];
    if (value === undefined) return `{{${key}}}`;
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  });

  return result;
}
