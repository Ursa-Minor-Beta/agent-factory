import type { WorkflowNode } from '../../domain/entities/Agent.js';
import type { ExecutionContext } from '../context.js';
import { BaseNode, type NodeExecutionResult, type ExecutionOptions } from './base.js';
import { NodeExecutionError } from '../../utils/errors.js';
import { interpolate } from './utils.js';

interface HttpNodeData {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
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
    const inputs = context.getAllInputs(node.id);

    // Merge workflow input with edge-resolved inputs for template interpolation
    const templateValues = { ...options.workflowInput, ...inputs };

    // Interpolate URL with input values
    const url = interpolate(data.url, templateValues);
    const method = data.method ?? 'GET';
    const timeout = data.timeout ?? 30000;

    // Prepare headers
    const headers: Record<string, string> = { ...data.headers };
    if (method !== 'GET' && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    // Interpolate header values
    for (const [key, value] of Object.entries(headers)) {
      headers[key] = interpolate(value, templateValues);
    }

    // Prepare body
    let body: string | undefined;
    if (method !== 'GET') {
      const requestBody = inputs.body ?? data.body;
      if (requestBody !== undefined) {
        body =
          typeof requestBody === 'string'
            ? interpolate(requestBody, templateValues)
            : JSON.stringify(requestBody);
      }
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

      return { outputs };
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
