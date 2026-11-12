import { Worker } from 'node:worker_threads';

export interface SandboxLogEntry {
  level: 'log' | 'warn' | 'error';
  message: string;
}

/** Error from sandbox execution, carrying console output captured before the failure */
export class SandboxError extends Error {
  constructor(message: string, readonly logs: SandboxLogEntry[] = []) {
    super(message);
  }
}

/**
 * Globals available to sandboxed code (for documentation)
 */
export const SANDBOX_AVAILABLE_GLOBALS = [
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

const SANDBOX_DIRECT_GLOBALS = SANDBOX_AVAILABLE_GLOBALS.filter((g) => g !== 'console');

/** Limits for captured console output */
const MAX_LOG_ENTRIES = 100;
const MAX_LOG_LENGTH = 2000;

const sandboxEntries = [
  ...SANDBOX_DIRECT_GLOBALS,
  'console: { log: capture(\'log\'), warn: capture(\'warn\'), error: capture(\'error\') }',
]
  .map((entry) => `  ${entry}`)
  .join(',\n');

/**
 * Worker script that runs user code in isolation.
 * `script` is an expression; its (awaited) value is the result, falling back to the `output` global.
 * Crypto helpers live in the worker realm so user code never gets `require`.
 */
const workerScript = `
const { parentPort, workerData } = require('node:worker_threads');
const vm = require('node:vm');
const crypto = require('node:crypto');

const { script, data, cryptoHelpers, hostMethods } = workerData;

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
  ...data,
${sandboxEntries},
};

if (cryptoHelpers) {
  sandbox.hmacSha256 = (secret, value) =>
    crypto.createHmac('sha256', String(secret)).update(String(value)).digest('hex');
  sandbox.safeEqual = (a, b) => {
    const bufA = Buffer.from(String(a));
    const bufB = Buffer.from(String(b));
    return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
  };
  sandbox.now = () => Math.floor(Date.now() / 1000);
}

// Async functions forwarded to the host (see SandboxOptions.onHostCall)
if (hostMethods.length > 0) {
  const pending = new Map();
  let seq = 0;
  parentPort.on('message', (msg) => {
    const call = pending.get(msg.id);
    if (!call) return;
    pending.delete(msg.id);
    if (msg.error !== undefined) call.reject(new Error(msg.error));
    else call.resolve(msg.result);
  });
  for (const method of hostMethods) {
    sandbox[method] = (...args) => new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      parentPort.postMessage({ type: 'call', id, method, args });
    });
  }
}

const ctx = vm.createContext(sandbox);

(async () => {
  try {
    let result = await new vm.Script(script).runInContext(ctx);
    if (result === undefined) result = sandbox.output;
    parentPort.postMessage({ type: 'done', success: true, result, logs });
  } catch (error) {
    parentPort.postMessage({
      type: 'done',
      success: false,
      error: error instanceof Error ? error.message : String(error),
      logs
    });
  }
})();
`;

export interface SandboxOptions {
  /** JS expression to evaluate; may return a promise */
  script: string;
  /** Values exposed as sandbox globals (must be structured-cloneable) */
  data?: Record<string, unknown>;
  /** Expose hmacSha256, safeEqual and now() */
  cryptoHelpers?: boolean;
  /** Names of async sandbox globals whose calls are forwarded to onHostCall */
  hostMethods?: string[];
  /**
   * Handles host method calls. Time spent here doesn't count towards `timeout`;
   * the result is awaited before the sandbox resolves, even if user code didn't await it.
   */
  onHostCall?: (method: string, args: unknown[]) => Promise<unknown>;
  timeout: number;
  memoryMb: number;
  /** Prefix for error messages, e.g. "JS node" */
  label: string;
}

export interface SandboxResult {
  result: unknown;
  logs: SandboxLogEntry[];
}

type WorkerMessage =
  | { type: 'call'; id: number; method: string; args: unknown[] }
  | { type: 'done'; success: boolean; result?: unknown; error?: string; logs?: SandboxLogEntry[] };

/**
 * Run code in a Worker Thread with memory/CPU limits
 */
export function runInSandbox(options: SandboxOptions): Promise<SandboxResult> {
  const { script, data = {}, cryptoHelpers = false, hostMethods = [], onHostCall, timeout, memoryMb, label } = options;

  return new Promise((resolve, reject) => {
    const worker = new Worker(workerScript, {
      eval: true,
      workerData: { script, data, cryptoHelpers, hostMethods },
      resourceLimits: {
        maxOldGenerationSizeMb: memoryMb,
        maxYoungGenerationSizeMb: memoryMb / 4,
        stackSizeMb: 4,
      },
    });

    let finished = false;
    const finish = (fn: () => void) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      worker.terminate();
      fn();
    };

    // Timeout budget is paused while host calls are in flight
    let remaining = timeout;
    let timerStartedAt = Date.now();
    let timer: NodeJS.Timeout | undefined;
    const startTimer = () => {
      timerStartedAt = Date.now();
      timer = setTimeout(() => {
        finish(() => reject(new Error(`${label} execution timed out after ${timeout}ms`)));
      }, remaining);
    };
    const pauseTimer = () => {
      clearTimeout(timer);
      remaining = Math.max(0, remaining - (Date.now() - timerStartedAt));
    };
    startTimer();

    const inFlight = new Set<Promise<unknown>>();

    worker.on('message', (msg: WorkerMessage) => {
      if (msg.type === 'call') {
        if (inFlight.size === 0) pauseTimer();
        const call = (onHostCall ?? (() => Promise.reject(new Error(`Unknown host method ${msg.method}`))))(msg.method, msg.args)
          .then(
            (result) => ({ id: msg.id, result }),
            (error: unknown) => ({ id: msg.id, error: error instanceof Error ? error.message : String(error) })
          )
          .then((reply) => {
            inFlight.delete(call);
            if (finished) return;
            if (inFlight.size === 0) startTimer();
            worker.postMessage(reply);
          });
        inFlight.add(call);
        return;
      }

      const logs = msg.logs ?? [];
      // Let host calls started by user code (e.g. not awaited) settle before reporting
      const settle = Promise.all(inFlight);
      if (msg.success) {
        settle.then(() => finish(() => resolve({ result: msg.result, logs })));
      }
      else {
        settle.then(() => finish(() => reject(new SandboxError(`${label} execution failed: ${msg.error}`, logs))));
      }
    });

    worker.on('error', (err) => {
      // Check for memory limit exceeded
      if (err.message.includes('out of memory') || err.message.includes('heap')) {
        finish(() => reject(new Error(`${label} exceeded memory limit (${memoryMb}MB)`)));
      }
      else {
        finish(() => reject(new Error(`${label} execution failed: ${err.message}`)));
      }
    });

    worker.on('exit', (exitCode) => {
      if (exitCode !== 0) {
        finish(() => reject(new Error(`${label} worker exited with code ${exitCode}`)));
      }
    });
  });
}
