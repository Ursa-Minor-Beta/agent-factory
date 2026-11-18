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

/** Limits for captured console output */
const MAX_LOG_ENTRIES = 100;
const MAX_LOG_LENGTH = 2000;

/**
 * Runs inside the vm context before user code. node:vm is not a security boundary: any object or
 * function from the worker realm reachable by user code leads to the worker's Function constructor
 * (`x.constructor.constructor('return process')()`). So every value user code can touch is created
 * here, in the context realm: data is deep-copied in, helpers are context-realm wrappers that only
 * pass primitives to the bridge, and results leave through captured intrinsics (never by the worker
 * awaiting a context-realm thenable).
 */
const bootstrapScript = `(function (bridge) {
  'use strict';
  const { apply } = Reflect;
  const then = Promise.prototype.then;
  const resolvePromise = Promise.resolve.bind(Promise);
  const { keys } = Object;
  const isArray = Array.isArray;
  const stringify = JSON.stringify;

  // Deep copy of a worker-realm value into this realm
  const adopt = (value, seen = new Map()) => {
    if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return value;
    if (typeof value === 'function') return undefined;
    if (seen.has(value)) return seen.get(value);
    const tag = bridge.tag(value);
    let copy;
    if (tag === 'Date') return new Date(bridge.time(value));
    if (tag === 'Uint8Array' || tag === 'ArrayBuffer') {
      const bytes = bridge.bytes(value);
      copy = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) copy[i] = bytes[i];
      return tag === 'ArrayBuffer' ? copy.buffer : copy;
    }
    if (tag === 'Map') {
      copy = new Map();
      seen.set(value, copy);
      for (const [k, v] of bridge.entries(value)) copy.set(adopt(k, seen), adopt(v, seen));
      return copy;
    }
    if (tag === 'Set') {
      copy = new Set();
      seen.set(value, copy);
      for (const [v] of bridge.entries(value)) copy.add(adopt(v, seen));
      return copy;
    }
    copy = isArray(value) ? [] : {};
    seen.set(value, copy);
    for (const key of keys(value)) copy[key] = adopt(value[key], seen);
    return copy;
  };

  const message = (error) => {
    try { return String(error && typeof error === 'object' && 'message' in error ? error.message : error); }
    catch { return 'Unknown error'; }
  };

  const formatArg = (arg) => {
    if (typeof arg === 'string') return arg;
    try { return stringify(arg) ?? String(arg); } catch { return String(arg); }
  };
  const capture = (level) => (...args) => { bridge.log(level, args.map(formatArg).join(' ')); };
  globalThis.console = { log: capture('log'), warn: capture('warn'), error: capture('error') };

  const data = bridge.data;
  for (const key of keys(data)) globalThis[key] = adopt(data[key]);

  if (bridge.hmac) {
    globalThis.hmacSha256 = (secret, value) => bridge.hmac(String(secret), String(value));
    globalThis.safeEqual = (a, b) => bridge.safeEqual(String(a), String(b));
    globalThis.now = () => bridge.now();
  }

  for (const method of bridge.hostMethods) {
    globalThis[method] = (...args) => new Promise((resolve, reject) => {
      let payload;
      try { payload = stringify(args); }
      catch (error) { reject(new Error(method + ': arguments must be JSON-serializable')); return; }
      bridge.call(method, payload === undefined ? '[]' : payload,
        (result) => resolve(adopt(result)),
        (error) => reject(new Error(String(error))));
    });
  }

  // Settles the user script's value: thenables are resolved with this realm's intrinsics
  return (value) => {
    let promise;
    try { promise = resolvePromise(value); }
    catch (error) { bridge.fail(message(error)); return; }
    apply(then, promise, [
      (result) => {
        try { bridge.done(result === undefined ? globalThis.output : result); }
        catch (error) { bridge.fail('Result is not serializable: ' + message(error)); }
      },
      (error) => bridge.fail(message(error)),
    ]);
  };
})`;

/**
 * Worker script that runs user code in isolation.
 * `script` is an expression; its (awaited) value is the result, falling back to the `output` global.
 * Crypto helpers live in the worker realm so user code never gets `require`.
 */
const workerScript = `
const { parentPort, workerData } = require('node:worker_threads');
const vm = require('node:vm');
const crypto = require('node:crypto');

const { script, data, cryptoHelpers, hostMethods, bootstrap } = workerData;

const logs = [];
let finished = false;
const finish = (msg) => {
  if (finished) return;
  // Mark finished only after posting, so a non-cloneable result can still be reported via fail()
  parentPort.postMessage({ ...msg, type: 'done', logs });
  finished = true;
};

const pending = new Map();
let seq = 0;
parentPort.on('message', (msg) => {
  const call = pending.get(msg.id);
  if (!call) return;
  pending.delete(msg.id);
  if (msg.error !== undefined) call.reject(msg.error);
  else call.resolve(msg.result);
});

// Bridge: only ever hands primitives (or values copied by adopt()) to context-realm code
const bridge = {
  data,
  hostMethods,
  tag: (value) => {
    if (value instanceof Date) return 'Date';
    if (value instanceof Uint8Array) return 'Uint8Array';
    if (value instanceof ArrayBuffer) return 'ArrayBuffer';
    if (value instanceof Map) return 'Map';
    if (value instanceof Set) return 'Set';
    return 'Object';
  },
  time: (date) => date.getTime(),
  bytes: (value) => Array.from(value instanceof ArrayBuffer ? new Uint8Array(value) : value),
  entries: (value) => Array.from(value.entries()),
  log: (level, message) => {
    if (logs.length >= ${MAX_LOG_ENTRIES}) return;
    message = String(message);
    logs.push({ level, message: message.length > ${MAX_LOG_LENGTH} ? message.slice(0, ${MAX_LOG_LENGTH}) + '...' : message });
  },
  hmac: cryptoHelpers
    ? (secret, value) => crypto.createHmac('sha256', secret).update(value).digest('hex')
    : undefined,
  safeEqual: (a, b) => {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
  },
  now: () => Math.floor(Date.now() / 1000),
  call: (method, payload, onResult, onError) => {
    const id = ++seq;
    pending.set(id, { resolve: onResult, reject: onError });
    parentPort.postMessage({ type: 'call', id, method, args: JSON.parse(payload) });
  },
  done: (result) => finish({ success: true, result }),
  fail: (error) => finish({ success: false, error: String(error) }),
};

// Null prototype: otherwise globalThis.constructor is the worker realm's Object
const ctx = vm.createContext(Object.create(null));

try {
  const settle = new vm.Script(bootstrap).runInContext(ctx)(bridge);
  let value;
  try {
    value = new vm.Script(script).runInContext(ctx);
  } catch (error) {
    // Errors from compiling or running user code may be context-realm objects: read only primitives
    let message = 'Unknown error';
    try { message = String(error && typeof error === 'object' && 'message' in error ? error.message : error); } catch {}
    bridge.fail(message);
  }
  if (!finished) settle(value);
} catch (error) {
  bridge.fail(error instanceof Error ? error.message : String(error));
}
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
      workerData: { script, data, cryptoHelpers, hostMethods, bootstrap: bootstrapScript },
      // Defense in depth: even if user code escapes the context, it doesn't see server env
      env: {},
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
