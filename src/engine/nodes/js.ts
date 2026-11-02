import { Worker } from 'node:worker_threads';
import type { WorkflowNode } from '../../domain/entities/Agent.js';
import type { ExecutionContext } from '../context.js';
import { BaseNode, type NodeExecutionResult, type ExecutionOptions } from './base.js';
import { config } from '../../config/index.js';
import { interpolateDeep, NODE_PATTERN, resolveNodeRef } from './interpolate.js';
import { NodeExecutionError } from '../../utils/errors.js';
import { extractAndStoreFiles } from './file-helper.js';

type JsPersistedField = 'input';

/** A node ref that is the entire content of a JSON string literal: "{{node:id.path}}" */
const QUOTED_NODE_PATTERN = /"\{\{node:([^.}"]+)(?:\.([^}"]+))?\}\}"/g;

interface JsLogEntry {
  level: 'log' | 'warn' | 'error';
  message: string;
}

/** Error from worker execution, carrying console output captured before the failure */
class JsWorkerError extends Error {
  constructor(message: string, readonly logs: JsLogEntry[] = []) {
    super(message);
  }
}

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
export const JS_NODE_AVAILABLE_GLOBALS = [
  'JSON',
  'Math',
  'Date',
  'Number',
  'String',
  'Boolean',
  'Array',
  'Object',
  'Map',
  'Set',
  'RegExp',
  'Error',
  'TypeError',
  'RangeError',
  'SyntaxError',
  'parseInt',
  'parseFloat',
  'isNaN',
  'isFinite',
  'encodeURI',
  'decodeURI',
  'encodeURIComponent',
  'decodeURIComponent',
  'console',
] as const;

/** Sandbox entries for worker script (globals that map directly) */
const SANDBOX_DIRECT_GLOBALS = JS_NODE_AVAILABLE_GLOBALS.filter((g) => g !== 'console');

/** Limits for captured console output persisted in run state */
const MAX_LOG_ENTRIES = 100;
const MAX_LOG_LENGTH = 2000;

/** Generate sandbox object entries for worker script */
const sandboxEntries = [
  ...SANDBOX_DIRECT_GLOBALS,
  'console: { log: capture(\'log\'), warn: capture(\'warn\'), error: capture(\'error\') }',
]
  .map((entry) => `  ${entry}`)
  .join(',\n');

/**
 * Worker script that runs user code in isolation
 */
const workerScript = `
const { parentPort, workerData } = require('node:worker_threads');
const vm = require('node:vm');

const { code, input } = workerData;

const logs = [];
const formatArg = (arg) => {
  if (typeof arg === 'string') return arg;
  try { return JSON.stringify(arg) ?? String(arg); } catch { return String(arg); }
};
const capture = (level) => (...args) => {
  if (logs.length >= ${MAX_LOG_ENTRIES}) return;
  const message = args.map(formatArg).join(' ');
  logs.push({ level, message: message.length > ${MAX_LOG_LENGTH} ? message.slice(0, ${MAX_LOG_LENGTH}) + '...' : message });
};

const sandbox = {
  input,
  output: undefined,
${sandboxEntries},
};

const ctx = vm.createContext(sandbox);

const wrappedCode = \`
  (function() {
    \${code}
    return output;
  })()
\`;

try {
  const script = new vm.Script(wrappedCode);
  let result = script.runInContext(ctx);
  if (result === undefined) result = sandbox.output;
  parentPort.postMessage({ success: true, result, logs });
} catch (error) {
  parentPort.postMessage({
    success: false,
    error: error instanceof Error ? error.message : String(error),
    logs
  });
}
`;

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
      const { result, logs } = await this.runInWorker(code, input, timeout, memoryMb);
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
      const logs = error instanceof JsWorkerError ? error.logs : [];
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
    logs: JsLogEntry[]
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

  private runInWorker(
    code: string,
    input: unknown,
    timeout: number,
    memoryMb: number
  ): Promise<{ result: unknown; logs: JsLogEntry[] }> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(workerScript, {
        eval: true,
        workerData: { code, input },
        resourceLimits: {
          maxOldGenerationSizeMb: memoryMb,
          maxYoungGenerationSizeMb: memoryMb / 4,
          stackSizeMb: 4,
        },
      });

      const timer = setTimeout(() => {
        worker.terminate();
        reject(new Error(`JS node execution timed out after ${timeout}ms`));
      }, timeout);

      worker.on('message', (msg: { success: boolean; result?: unknown; error?: string; logs?: JsLogEntry[] }) => {
        clearTimeout(timer);
        worker.terminate();
        const logs = msg.logs ?? [];
        if (msg.success) {
          resolve({ result: msg.result, logs });
        }
        else {
          reject(new JsWorkerError(`JS node execution failed: ${msg.error}`, logs));
        }
      });

      worker.on('error', (err) => {
        clearTimeout(timer);
        worker.terminate();
        // Check for memory limit exceeded
        if (err.message.includes('out of memory') || err.message.includes('heap')) {
          reject(new Error(`JS node exceeded memory limit (${memoryMb}MB)`));
        }
        else {
          reject(new Error(`JS node execution failed: ${err.message}`));
        }
      });

      worker.on('exit', (exitCode) => {
        clearTimeout(timer);
        if (exitCode !== 0) {
          reject(new Error(`JS node worker exited with code ${exitCode}`));
        }
      });
    });
  }
}
