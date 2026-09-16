import type { WorkflowNode } from '../../domain/entities/Agent.js';
import type { ExecutionContext } from '../context.js';
import { BaseNode, type NodeExecutionResult, type ExecutionOptions } from './base.js';
import { NodeExecutionError } from '../../utils/errors.js';
import { interpolateAll } from './utils.js';

type HttpPersistedField = 'url' | 'method' | 'headers' | 'body' | 'status' | 'responseHeaders';

interface HttpNodeData {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
  persistedFields?: HttpPersistedField[];
}

/**
 * HTTP node - Make HTTP requests
 */
export class HttpNode extends BaseNode {
  readonly type = 'http';

  async execute(
    node: WorkflowNode,
    context: ExecutionContext,
    options: ExecutionOptions
  ): Promise<NodeExecutionResult> {
    const data = node.data as unknown as HttpNodeData;
    const secrets = options.resolvedSecrets ?? {};
    const interpolateOpts = { secrets, context };

    // Interpolate URL with input values, secrets, and node references
    const url = interpolateAll(data.url, interpolateOpts);
    const method = data.method ?? 'GET';
    const timeout = data.timeout ?? 30000;

    // Prepare headers
    const headers: Record<string, string> = { ...data.headers };
    if (method !== 'GET' && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    // Interpolate header values (supports {{secret:KEY}} and {{node:id.path}} syntax)
    for (const [key, value] of Object.entries(headers)) {
      headers[key] = interpolateAll(value, interpolateOpts);
    }

    // Prepare body
    let body: string | undefined;
    if (method !== 'GET' && data.body !== undefined) {
      body =
        typeof data.body === 'string'
          ? interpolateAll(data.body, interpolateOpts)
          : JSON.stringify(data.body);
    }

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const requestContext = {
      url,
      method,
      body: body ? (body.length > 500 ? `${body.slice(0, 500)}...` : body) : undefined,
    };

    try {
      const res = await fetch(url, {
        method,
        headers,
        body,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const status = res.status;
      let response: unknown;

      const contentType = res.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) {
        response = await res.json();
      } else {
        response = await res.text();
      }

      const outputs = { response, status };
      context.setOutput(node.id, 'response', response);
      context.setOutput(node.id, 'status', status);

      // Build state based on persistedFields config
      // TODO make base
      let state: Record<string, unknown> | undefined;
      if (data.persistedFields?.length) {
        state = {};
        for (const field of data.persistedFields) {
          switch (field) {
            case 'url':
              state.url = url;
              break;
            case 'method':
              state.method = method;
              break;
            case 'headers':
              state.headers = headers;
              break;
            case 'body':
              state.body = body;
              break;
            case 'status':
              state.status = status;
              break;
            case 'responseHeaders':
              state.responseHeaders = Object.fromEntries(res.headers.entries());
              break;
          }
        }
      }

      return { outputs, state };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        throw new NodeExecutionError(
          `HTTP request timed out after ${timeout}ms`,
          { request: requestContext },
          error
        );
      }
      throw new NodeExecutionError(
        `HTTP request failed: ${error instanceof Error ? error.message : String(error)}`,
        { request: requestContext },
        error
      );
    }
  }
}
