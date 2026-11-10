import type { WorkflowNode } from '../../domain/entities/Agent.js';
import type { ExecutionContext } from '../context.js';
import { BaseNode, type NodeExecutionResult, type ExecutionOptions } from './base.js';
import { config } from '../../config/index.js';
import { interpolateDeep, NODE_PATTERN, resolveNodeRef } from './interpolate.js';
import { NodeExecutionError } from '../../utils/errors.js';
import { extractAndStoreFiles } from './file-helper.js';
import { runInSandbox, SandboxError, SANDBOX_AVAILABLE_GLOBALS, type SandboxLogEntry } from '../../utils/sandbox.js';

type JsPersistedField = 'input';

/** A node ref that is the entire content of a JSON string literal: "{{node:id.path}}" */
const QUOTED_NODE_PATTERN = /"\{\{node:([^.}"]+)(?:\.([^}"]+))?\}\}"/g;

/**
 * Check whether a position in a JSON-ish template is inside a "..." string literal
 */
function isInsideJsonString(template: string, offset: number): boolean {
  let inside = false;
  for (let i = 0; i < offset; i++) {
    if (template[i] === '\\') i++;
    else if (template[i] === '"') inside = !inside;
  }
  return inside;
}

interface JsNodeData {
  code?: string;
  timeout?: number;
  memoryMb?: number;
  input?: string;
  persistedFields?: JsPersistedField[];
}

/**
 * Available globals in JS node sandbox (for documentation)
 */
export const JS_NODE_AVAILABLE_GLOBALS = SANDBOX_AVAILABLE_GLOBALS;

/**
 * JS Transform node - Execute JavaScript code to transform data
 * Uses Worker Threads for isolation with memory/CPU limits
 *
 * Use data.input with {{node:id.path}} template to specify input source
 */
export class JsNode extends BaseNode {
  readonly type = 'js';

  async execute(
    node: WorkflowNode,
    context: ExecutionContext,
    _options: ExecutionOptions
  ): Promise<NodeExecutionResult> {
    const data = node.data as unknown as JsNodeData;
    const code = data.code ?? 'output = input;';
    const { defaultTimeoutMs, maxTimeoutMs, defaultMemoryMb, maxMemoryMb } = config.jsNode;
    const timeout = Math.min(data.timeout ?? defaultTimeoutMs, maxTimeoutMs);
    const memoryMb = Math.min(data.memoryMb ?? defaultMemoryMb, maxMemoryMb);

    const input = this.resolveInput(data, context);

    try {
      const { result, logs } = await runInSandbox({
        script: `(function() {\n${code}\nreturn output;\n})()`,
        data: { input, output: undefined },
        timeout,
        memoryMb,
        label: 'JS node',
      });
      // Normalize undefined to null so {{node:id.output}} refs resolve downstream
      const output = result ?? null;
      const state = this.buildState(data, input, logs);

      const outputs = { output };

      // Extract files from output, store in context with temp refs
      const { cleanedOutput, fileRefs } = extractAndStoreFiles(outputs, node.id, context);

      context.setOutput(node.id, 'output', (cleanedOutput as Record<string, unknown>).output);

      return {
        outputs: cleanedOutput as Record<string, unknown>,
        state,
        files: fileRefs.length > 0 ? fileRefs : undefined,
      };
    } 
    catch (error) {
      const logs = error instanceof SandboxError ? error.logs : [];
      throw new NodeExecutionError(
        error instanceof Error ? error.message : String(error),
        {},
        error,
        this.buildState(data, input, logs)
      );
    }
  }

  private resolveInput(data: JsNodeData, context: ExecutionContext): unknown {
    return interpolateDeep(this.nullifyUnresolvedRefs(data.input, context), { context });
  }

  /**
   * Make {{node:...}} refs JSON-safe so input templates like
   * { "a": {{node:x.y}} } still parse:
   *   - unresolved refs become null
   *   - resolved values are JSON-encoded (strings get quoted and escaped)
   *   - a quoted ref that is the whole string literal ("{{node:x}}") is treated as a bare ref
   *   - refs embedded in a longer string literal are escaped without extra quotes
   *     (unresolved ones become an empty string)
   */
  private nullifyUnresolvedRefs(value: unknown, context: ExecutionContext): unknown {
    if (typeof value === 'string') {
      const toJson = (nodeId: string, path: string | undefined): string => {
        const resolved = resolveNodeRef(nodeId, path, context);
        return resolved === undefined ? 'null' : JSON.stringify(resolved);
      };

      return value
        .replace(QUOTED_NODE_PATTERN, (_match, nodeId: string, path: string | undefined) => toJson(nodeId, path))
        .replace(NODE_PATTERN, (_match, nodeId: string, path: string | undefined, offset: number, template: string) => {
          if (!isInsideJsonString(template, offset)) return toJson(nodeId, path);

          const resolved = resolveNodeRef(nodeId, path, context);
          if (resolved === undefined) return '';
          const text = typeof resolved === 'string' ? resolved : JSON.stringify(resolved);
          return JSON.stringify(text).slice(1, -1);
        });
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.nullifyUnresolvedRefs(item, context));
    }
    if (value !== null && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, this.nullifyUnresolvedRefs(v, context)])
      );
    }
    return value;
  }

  private buildState(
    data: JsNodeData,
    input: unknown,
    logs: SandboxLogEntry[]
  ): Record<string, unknown> | undefined {
    if (!data.persistedFields?.length && logs.length === 0) return undefined;

    const state: Record<string, unknown> = {};
    if (logs.length > 0) {
      state.logs = logs;
    }
    for (const field of data.persistedFields ?? []) {
      switch (field) {
      case 'input':
        state.input = input;
        break;
      }
    }
    return state;
  }
}
