import { Worker } from 'node:worker_threads';
import type { WorkflowNode } from '../../domain/entities/Agent.js';
import type { ExecutionContext } from '../context.js';
import { BaseNode, type NodeExecutionResult, type ExecutionOptions } from './base.js';
import { config } from '../../config/index.js';
import { interpolateAll } from './utils.js';

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

/** Generate sandbox object entries for worker script */
const sandboxEntries = [
  ...SANDBOX_DIRECT_GLOBALS,
  'console: { log: () => {}, warn: () => {}, error: () => {} }',
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
  parentPort.postMessage({ success: true, result });
} catch (error) {
  parentPort.postMessage({
    success: false,
    error: error instanceof Error ? error.message : String(error)
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
    options: ExecutionOptions
  ): Promise<NodeExecutionResult> {
    const code = (node.data.code as string) ?? 'output = input;';
    const { defaultTimeoutMs, maxTimeoutMs, defaultMemoryMb, maxMemoryMb } = config.jsNode;
    const timeout = Math.min((node.data.timeout as number) ?? defaultTimeoutMs, maxTimeoutMs);
    const memoryMb = Math.min((node.data.memoryMb as number) ?? defaultMemoryMb, maxMemoryMb);

    // Get input from template or workflow input
    let input: unknown;
    if (node.data.input && typeof node.data.input === 'string') {
      const interpolated = interpolateAll(node.data.input, { context });
      try {
        input = JSON.parse(interpolated);
      } catch {
        input = interpolated;
      }
    } else {
      input = options.workflowInput;
    }

    const output = await this.runInWorker(code, input, timeout, memoryMb);

    const outputs = { output };
    context.setOutput(node.id, 'output', output);

    return { outputs };
  }

  private runInWorker(
    code: string,
    input: unknown,
    timeout: number,
    memoryMb: number
  ): Promise<unknown> {
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

      worker.on('message', (msg: { success: boolean; result?: unknown; error?: string }) => {
        clearTimeout(timer);
        worker.terminate();
        if (msg.success) {
          resolve(msg.result);
        } else {
          reject(new Error(`JS node execution failed: ${msg.error}`));
        }
      });

      worker.on('error', (err) => {
        clearTimeout(timer);
        worker.terminate();
        // Check for memory limit exceeded
        if (err.message.includes('out of memory') || err.message.includes('heap')) {
          reject(new Error(`JS node exceeded memory limit (${memoryMb}MB)`));
        } else {
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
