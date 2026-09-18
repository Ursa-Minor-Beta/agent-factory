import type { WorkflowNode } from '../../domain/entities/Agent.js';
import type { ExecutionContext } from '../context.js';
import { BaseNode, type NodeExecutionResult, type ExecutionOptions } from './base.js';
import { NodeExecutionError } from '../../utils/errors.js';
import { interpolateAll } from './utils.js';

type HttpPersistedField = 'url' | 'method' | 'headers' | 'body' | 'status' | 'responseHeaders' | 'sseEvents';

interface HttpNodeData {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
  persistedFields?: HttpPersistedField[];
}

interface SSEEvent {
  event?: string;
  data?: string;
  id?: string;
}

interface SSEResult {
  accumulated: Record<string, unknown>;
  events: SSEEvent[];
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

    const url = interpolateAll(data.url, interpolateOpts);
    const method = data.method ?? 'GET';
    const timeout = data.timeout ?? 30_000;

    const body = this.prepareBody(data, method, interpolateOpts);
    const headers = this.prepareHeaders(data, body, interpolateOpts);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const requestContext = {
      url,
      method,
      body: body ? (body.length > 500 ? `${body.slice(0, 500)}...` : body) : undefined,
    };

    const state = this.buildRequestState(data, url, method, headers, body);

    try {
      const res = await fetch(url, {
        method,
        headers,
        body,
        signal: controller.signal,
      });

      const status = res.status;
      const contentType = res.headers.get('content-type') ?? '';

      // Pass signal to parseResponse - SSE streaming should also respect timeout
      const { data: response, sseEvents } = await this.parseResponse(
        res,
        contentType,
        options.requiredOutputPaths,
        controller.signal
      );

      clearTimeout(timeoutId);

      const outputs = { response, status };
      context.setOutput(node.id, 'response', response);
      context.setOutput(node.id, 'status', status);

      this.addResponseState(data, state, status, res.headers, sseEvents);

      return { outputs, state };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        const partialData = (error as unknown as { partialData?: SSEResult }).partialData;

        // Add sseEvents to state if we collected any before timeout
        if (partialData?.events && state && data.persistedFields?.includes('sseEvents')) {
          state.sseEvents = partialData.events;
        }

        throw new NodeExecutionError(
          `HTTP request timed out after ${timeout}ms`,
          {
            request: requestContext,
            response: partialData ? { body: JSON.stringify(partialData.accumulated) } : undefined,
          },
          error,
          state
        );
      }
      throw new NodeExecutionError(
        `HTTP request failed: ${error instanceof Error ? error.message : String(error)}`,
        { request: requestContext },
        error,
        state
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Request Preparation
  // ─────────────────────────────────────────────────────────────────

  private prepareHeaders(
    data: HttpNodeData,
    body: string | undefined,
    interpolateOpts: { secrets: Record<string, string>; context: ExecutionContext }
  ): Record<string, string> {
    const headers: Record<string, string> = { ...data.headers };
    // Only include Content-Type: application/json when there's a body
    if (body !== undefined) {
      headers['Content-Type'] ??= 'application/json';
    } 
    else if (headers['Content-Type']?.includes('application/json')) {
      delete headers['Content-Type'];
    }
    for (const [key, value] of Object.entries(headers)) {
      headers[key] = interpolateAll(value, interpolateOpts);
    }
    return headers;
  }

  private prepareBody(
    data: HttpNodeData,
    method: string,
    interpolateOpts: { secrets: Record<string, string>; context: ExecutionContext }
  ): string | undefined {
    if (method === 'GET' || data.body === undefined) return undefined;
    return typeof data.body === 'string'
      ? interpolateAll(data.body, interpolateOpts)
      : JSON.stringify(data.body);
  }

  // ─────────────────────────────────────────────────────────────────
  // State Management
  // ─────────────────────────────────────────────────────────────────

  private buildRequestState(
    data: HttpNodeData,
    url: string,
    method: string,
    headers: Record<string, string>,
    body: string | undefined
  ): Record<string, unknown> | undefined {
    if (!data.persistedFields?.length) return undefined;

    const state: Record<string, unknown> = {};
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
          if (body !== undefined) {
            state.body = body;
          }
          break;
      }
    }
    return state;
  }

  private addResponseState(
    data: HttpNodeData,
    state: Record<string, unknown> | undefined,
    status: number,
    headers: Headers,
    sseEvents?: SSEEvent[]
  ): void {
    if (!data.persistedFields?.length || !state) return;

    for (const field of data.persistedFields) {
      switch (field) {
        case 'status':
          state.status = status;
          break;
        case 'responseHeaders':
          state.responseHeaders = Object.fromEntries(headers.entries());
          break;
        case 'sseEvents':
          if (sseEvents) {
            state.sseEvents = sseEvents;
          }
          break;
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Response Parsing
  // ─────────────────────────────────────────────────────────────────

  private async parseResponse(
    res: Response,
    contentType: string,
    requiredPaths?: string[],
    signal?: AbortSignal
  ): Promise<{ data: unknown; sseEvents?: SSEEvent[] }> {
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`HTTP ${res.status}: ${res.statusText} - ${body}`);
    }
    if (contentType.includes('text/event-stream') && res.body) {
      const result = await this.parseSSEResponse(res.body, requiredPaths ?? [], signal);
      return { data: result.accumulated, sseEvents: result.events };
    }
    if (contentType.includes('application/json')) {
      return { data: await res.json() };
    }
    return { data: await res.text() };
  }

  private async parseSSEResponse(
    body: ReadableStream<Uint8Array>,
    requiredPaths: string[],
    signal?: AbortSignal
  ): Promise<SSEResult> {
    const accumulated: Record<string, unknown> = {};
    const collectedEvents: SSEEvent[] = [];
    let buffer = '';

    const reader = body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        // Check if aborted (timeout)
        if (signal?.aborted) {
          reader.cancel();
          const error = new DOMException('SSE stream aborted', 'AbortError');
          (error as unknown as { partialData: SSEResult }).partialData = { accumulated, events: collectedEvents };
          throw error;
        }

        let done: boolean;
        let value: Uint8Array | undefined;
        try {
          const result = await reader.read();
          done = result.done;
          value = result.value;
        } catch (readError) {
          // reader.read() throws AbortError when signal is aborted
          if (readError instanceof Error && readError.name === 'AbortError') {
            (readError as unknown as { partialData: SSEResult }).partialData = { accumulated, events: collectedEvents };
          }
          throw readError;
        }

        if (done) break;

        const decoded = decoder.decode(value, { stream: true });
        buffer += decoded;

        // Try both standard SSE (\n\n delimiter) and raw JSON lines (\n delimiter)
        const lines = buffer.split('\n');
        const incompleteLine = lines.pop() ?? '';
        buffer = incompleteLine;

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          // Try standard SSE format first (data: prefix)
          if (trimmed.startsWith('data:')) {
            const data = trimmed.slice(5).trim();
            if (data === '[DONE]') continue;
            collectedEvents.push({ data });
            this.processEventData(data, accumulated);
          }
          // Try raw JSON (non-standard SSE)
          else if (trimmed.startsWith('{')) {
            collectedEvents.push({ data: trimmed });
            this.processEventData(trimmed, accumulated);
          }
          // Skip keep-alive or other non-data lines
        }

        // Check if all required paths exist for early termination
        // Note: requiredPaths may have 'response.' prefix since downstream nodes reference {{node:id.response.field}}
        // but accumulated data is the response itself, so strip 'response.' prefix
        const normalizedPaths = requiredPaths.map(p => p.startsWith('response.') ? p.slice(9) : p);
        if (normalizedPaths.length > 0 && this.allPathsExist(accumulated, normalizedPaths)) {
          reader.cancel();
          break;
        }
      }

      // Process remaining buffer (handles chunks without trailing newline)
      const remaining = buffer.trim();
      if (remaining) {
        if (remaining.startsWith('data:')) {
          const data = remaining.slice(5).trim();
          if (data !== '[DONE]') {
            collectedEvents.push({ data });
            this.processEventData(data, accumulated);
          }
        } else if (remaining.startsWith('{')) {
          collectedEvents.push({ data: remaining });
          this.processEventData(remaining, accumulated);
        }
      }
    } finally {
      reader.releaseLock();
    }

    return { accumulated, events: collectedEvents };
  }

  // ─────────────────────────────────────────────────────────────────
  // SSE Utilities
  // ─────────────────────────────────────────────────────────────────

  private processEventData(data: string, accumulated: Record<string, unknown>): void {
    try {
      const parsed = JSON.parse(data);
      this.deepMerge(accumulated, parsed);
    } catch {
      accumulated['_raw'] = accumulated['_raw']
        ? `${accumulated['_raw']}${data}`
        : data;
    }
  }

  private parseSSEEvents(text: string): SSEEvent[] {
    const events: SSEEvent[] = [];
    const lines = text.split('\n');
    let current: SSEEvent = {};

    for (const line of lines) {
      if (line === '') {
        if (current.data !== undefined) {
          events.push(current);
        }
        current = {};
      } else if (line.startsWith('data:')) {
        const data = line.slice(5).trim();
        current.data = current.data ? current.data + '\n' + data : data;
      } else if (line.startsWith('event:')) {
        current.event = line.slice(6).trim();
      } else if (line.startsWith('id:')) {
        current.id = line.slice(3).trim();
      }
    }

    return events;
  }

  private deepMerge(target: Record<string, unknown>, source: unknown): void {
    if (!source || typeof source !== 'object') return;
    for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        if (!target[key] || typeof target[key] !== 'object') {
          target[key] = {};
        }
        this.deepMerge(target[key] as Record<string, unknown>, value);
      } else {
        target[key] = value;
      }
    }
  }

  private allPathsExist(obj: unknown, paths: string[]): boolean {
    return paths.every((path) => this.getByPath(obj, path) !== undefined);
  }

  private getByPath(obj: unknown, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;
    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      if (typeof current !== 'object') return undefined;
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }
}
