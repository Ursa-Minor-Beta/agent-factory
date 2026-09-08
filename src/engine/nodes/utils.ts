/**
 * Replace {{variable}} placeholders with actual values
 * Supports workflow input field names and edge handle names
 */
export function interpolate(template: string, values: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = values[key];
    if (value === undefined) return `{{${key}}}`;
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  });
}
