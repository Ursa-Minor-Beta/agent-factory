import { NodeExecutionError } from '../../../utils/errors.js';
import { interpolateAll, type InterpolateOptions } from '../interpolate.js';
import type { LlmProtocol } from '../../../domain/entities/ProviderConfig.js';

/**
 * Remote MCP server called natively by the provider (Anthropic MCP connector, OpenAI Responses mcp tool).
 * The provider's cloud connects to the server, so the URL must be publicly reachable.
 */
export interface McpServerConfig {
  /** Server label, unique within the node (used as tool name prefix) */
  name: string;
  /** Streamable HTTP / SSE endpoint */
  url: string;
  /** Bearer token, e.g. {{secret:GITHUB_TOKEN}} */
  authorizationToken?: string;
  /** Extra request headers (OpenAI only) */
  headers?: Record<string, string>;
  /** Restrict to these tool names; all tools when omitted */
  allowedTools?: string[];
}

const MCP_PROTOCOLS: readonly LlmProtocol[] = ['anthropic', 'openai-responses'];

/** Tool name used in node toolCalls output for an MCP call */
export function mcpToolCallName(serverName: string, toolName: string): string {
  return `mcp__${serverName}__${toolName}`;
}

/**
 * Accept an array, a single server object, or a JSON string of either
 */
function normalizeMcpServers(raw: McpServerConfig[] | McpServerConfig | string | undefined): McpServerConfig[] {
  let value: unknown = raw;
  if (typeof value === 'string') {
    if (!value.trim()) return [];
    try {
      value = JSON.parse(value);
    }
    catch {
      throw new NodeExecutionError('mcpServers must be valid JSON', {});
    }
  }
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value as McpServerConfig[];
  if (typeof value === 'object') return [value as McpServerConfig];
  throw new NodeExecutionError('mcpServers must be an array of {name, url, ...} objects', {});
}

/**
 * Interpolate templates in MCP server configs and validate them for the provider protocol
 */
export function resolveMcpServers(
  raw: McpServerConfig[] | McpServerConfig | string | undefined,
  protocol: LlmProtocol,
  interpolateOpts: InterpolateOptions
): McpServerConfig[] | undefined {
  const servers = normalizeMcpServers(raw);
  if (servers.length === 0) return undefined;

  if (!MCP_PROTOCOLS.includes(protocol)) {
    throw new NodeExecutionError('MCP servers are supported only for anthropic and openai providers', {});
  }

  const seen = new Set<string>();
  return servers.map((server, index) => {
    const name = interpolateAll(server.name ?? '', interpolateOpts).trim();
    const url = interpolateAll(server.url ?? '', interpolateOpts).trim();
    if (!name || !url) {
      throw new NodeExecutionError(`MCP server #${index + 1}: name and url are required`, {});
    }
    if (seen.has(name)) {
      throw new NodeExecutionError(`MCP server name "${name}" is used more than once`, {});
    }
    seen.add(name);

    const headers = server.headers
      ? Object.fromEntries(Object.entries(server.headers).map(([k, v]) => [k, interpolateAll(String(v), interpolateOpts)]))
      : undefined;
    if (headers && Object.keys(headers).length > 0 && protocol === 'anthropic') {
      throw new NodeExecutionError(`MCP server "${name}": custom headers are not supported by Anthropic, use authorizationToken`, {});
    }

    const authorizationToken = server.authorizationToken
      ? interpolateAll(server.authorizationToken, interpolateOpts).trim()
      : undefined;

    return {
      name,
      url,
      authorizationToken: authorizationToken || undefined,
      headers,
      allowedTools: server.allowedTools?.length ? server.allowedTools : undefined,
    };
  });
}
