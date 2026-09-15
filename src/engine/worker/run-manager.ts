import { fork, type ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import type { Agent } from '../../domain/entities/Agent.js';
import type { IRunRepository } from '../../domain/interfaces/repositories/IRunRepository.js';
import type { ProviderConfig } from '../nodes/index.js';

// Re-export for convenience
export type { ProviderConfig };
import type { WorkerMessage, WorkerExecutionConfig, SessionContext } from './messages.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface RunManagerConfig {
  mongoUri: string;
  /** Timeout in ms before SIGKILL after SIGTERM (default: 5000) */
  killTimeout?: number;
}

export interface StartRunOptions {
  agent: Agent;
  input: Record<string, unknown>;
  userId: string;
  /** Provider config (API keys, etc.) - user-specific */
  providers: ProviderConfig;
  resolvedSecrets?: Record<string, string>;
  /** Session context for chat-based execution */
  sessionContext?: SessionContext;
}

interface ActiveRun {
  process: ChildProcess;
  runId: string;
  startedAt: Date;
  killTimer?: NodeJS.Timeout;
  completionPromise?: {
    resolve: (result: RunCompletionResult) => void;
    reject: (error: Error) => void;
  };
}

export interface RunCompletionResult {
  status: 'completed' | 'failed' | 'cancelled';
  output?: Record<string, unknown>;
  files?: string[];
  error?: string;
}

/**
 * Manages child processes for agent run execution.
 * Each run executes in an isolated child process for:
 * - Memory isolation
 * - Clean cancellation via process termination
 * - Crash isolation (worker crash doesn't affect main server)
 */
export class RunManager extends EventEmitter {
  private activeRuns = new Map<string, ActiveRun>();
  private config: Required<RunManagerConfig>;
  private runRepo: IRunRepository;

  constructor(runRepo: IRunRepository, config: RunManagerConfig) {
    super();
    this.runRepo = runRepo;
    this.config = {
      ...config,
      killTimeout: config.killTimeout ?? 5000,
    };
  }

  /**
   * Start a new run in a child process
   */
  async startRun(runId: string, options: StartRunOptions): Promise<void> {
    if (this.activeRuns.has(runId)) {
      throw new Error(`Run ${runId} is already active`);
    }

    const workerPath = join(__dirname, 'executor-worker.js');

    const child = fork(workerPath, [], {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      env: {
        ...process.env,
        NODE_ENV: process.env['NODE_ENV'],
      },
    });

    const activeRun: ActiveRun = {
      process: child,
      runId,
      startedAt: new Date(),
    };
    this.activeRuns.set(runId, activeRun);

    // Handle worker messages
    child.on('message', (msg: WorkerMessage) => {
      this.handleWorkerMessage(runId, msg);
    });

    // Handle worker exit
    child.on('exit', (code, signal) => {
      this.handleWorkerExit(runId, code, signal);
    });

    // Handle worker errors
    child.on('error', (error) => {
      this.emit('error', { runId, error });
      this.cleanup(runId);
    });

    // Capture stdout/stderr for debugging
    child.stdout?.on('data', (data: Buffer) => {
      this.emit('log', { runId, level: 'info', message: data.toString() });
    });

    child.stderr?.on('data', (data: Buffer) => {
      this.emit('log', { runId, level: 'error', message: data.toString() });
    });

    // Send start message
    const config: WorkerExecutionConfig = {
      runId,
      agent: options.agent,
      input: options.input,
      userId: options.userId,
      providers: options.providers,
      mongoUri: this.config.mongoUri,
      resolvedSecrets: options.resolvedSecrets,
      sessionContext: options.sessionContext,
    };

    child.send({ type: 'start', config });
  }

  /**
   * Start a run and wait for completion
   * Returns when the run completes, fails, or is cancelled
   */
  async executeAndWait(runId: string, options: StartRunOptions): Promise<RunCompletionResult> {
    // Create promise that will be resolved when run completes
    const completionPromise = new Promise<RunCompletionResult>((resolve) => {
      let resolved = false;

      const cleanup = () => {
        this.removeListener('run-completed', onComplete);
        this.removeListener('run-failed', onFail);
        this.removeListener('run-cancelled', onCancel);
        this.removeListener('worker-exit', onWorkerExit);
      };

      const safeResolve = (result: RunCompletionResult) => {
        if (resolved) return;
        resolved = true;
        cleanup();
        resolve(result);
      };

      const onComplete = (event: { runId: string; output?: Record<string, unknown>; files?: string[] }) => {
        if (event.runId === runId) {
          safeResolve({ status: 'completed', output: event.output, files: event.files });
        }
      };

      const onFail = (event: { runId: string; error: string }) => {
        if (event.runId === runId) {
          safeResolve({ status: 'failed', error: event.error });
        }
      };

      const onCancel = (event: { runId: string }) => {
        if (event.runId === runId) {
          safeResolve({ status: 'cancelled' });
        }
      };

      // Fallback: if worker exits without sending completion message, resolve with error
      const onWorkerExit = (event: { runId: string; code: number | null; signal: string | null }) => {
        if (event.runId === runId && !resolved) {
          const errorMsg = event.signal
            ? `Worker exited with signal ${event.signal}`
            : `Worker exited with code ${event.code}`;
          safeResolve({ status: 'failed', error: errorMsg });
        }
      };

      this.on('run-completed', onComplete);
      this.on('run-failed', onFail);
      this.on('run-cancelled', onCancel);
      this.on('worker-exit', onWorkerExit);
    });

    // Start the run
    await this.startRun(runId, options);

    // Wait for completion
    return completionPromise;
  }

  /**
   * Cancel a running execution
   * First sends SIGTERM for graceful shutdown, then SIGKILL after timeout
   */
  async cancelRun(runId: string): Promise<boolean> {
    const activeRun = this.activeRuns.get(runId);
    if (!activeRun) {
      // Run not active in this process - try to update DB status
      const run = await this.runRepo.findById(runId);
      if (run && run.status === 'running') {
        await this.runRepo.updateStatus(runId, 'cancelled');
        return true;
      }
      return false;
    }

    const { process: child } = activeRun;

    // Update status to cancelling
    await this.runRepo.updateStatus(runId, 'cancelling');

    // Send cancel message first (for graceful shutdown)
    child.send({ type: 'cancel' });

    // Then send SIGTERM
    child.kill('SIGTERM');

    // Set up hard kill timeout
    activeRun.killTimer = setTimeout(() => {
      if (!child.killed) {
        child.kill('SIGKILL');
        this.emit('log', {
          runId,
          level: 'warn',
          message: 'Worker did not exit gracefully, sent SIGKILL',
        });
      }
    }, this.config.killTimeout);

    return true;
  }

  /**
   * Check if a run is currently active
   */
  isRunActive(runId: string): boolean {
    return this.activeRuns.has(runId);
  }

  /**
   * Get all active run IDs
   */
  getActiveRunIds(): string[] {
    return Array.from(this.activeRuns.keys());
  }

  /**
   * Get count of active runs
   */
  getActiveRunCount(): number {
    return this.activeRuns.size;
  }

  /**
   * Gracefully shutdown all active runs
   */
  async shutdown(): Promise<void> {
    const runIds = this.getActiveRunIds();
    await Promise.all(runIds.map((id) => this.cancelRun(id)));

    // Wait for all processes to exit
    await new Promise<void>((resolve) => {
      const checkInterval = setInterval(() => {
        if (this.activeRuns.size === 0) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);

      // Force resolve after kill timeout + buffer
      setTimeout(() => {
        clearInterval(checkInterval);
        resolve();
      }, this.config.killTimeout + 1000);
    });
  }

  private handleWorkerMessage(runId: string, msg: WorkerMessage): void {
    this.emit('message', { runId, message: msg });

    switch (msg.type) {
      case 'started':
        this.emit('run-started', { runId });
        break;

      case 'node-started':
        this.emit('node-started', { runId, nodeId: msg.nodeId, nodeType: msg.nodeType });
        break;

      case 'node-completed':
        this.emit('node-completed', { runId, nodeId: msg.nodeId, nodeType: msg.nodeType, state: msg.state });
        break;

      case 'node-failed':
        this.emit('node-failed', { runId, nodeId: msg.nodeId, nodeType: msg.nodeType, error: msg.error });
        break;

      case 'node-skipped':
        this.emit('node-skipped', { runId, nodeId: msg.nodeId, nodeType: msg.nodeType });
        break;

      case 'completed':
        this.emit('run-completed', { runId, output: msg.output, files: msg.files });
        this.cleanup(runId);
        break;

      case 'failed':
        this.emit('run-failed', { runId, error: msg.error });
        this.cleanup(runId);
        break;

      case 'cancelled':
        this.emit('run-cancelled', { runId });
        this.cleanup(runId);
        break;
    }
  }

  private async handleWorkerExit(runId: string, code: number | null, signal: string | null): Promise<void> {
    const activeRun = this.activeRuns.get(runId);

    // Clear kill timer if set
    if (activeRun?.killTimer) {
      clearTimeout(activeRun.killTimer);
    }

    // If process exited unexpectedly (not via our cleanup), mark as failed
    if (this.activeRuns.has(runId)) {
      const run = await this.runRepo.findById(runId);

      if (run && run.status === 'running') {
        // Unexpected exit while running
        const errorMsg = signal
          ? `Worker killed by signal ${signal}`
          : `Worker exited with code ${code}`;
        await this.runRepo.fail(runId, errorMsg);
        this.emit('run-failed', { runId, error: errorMsg });
      } else if (run && run.status === 'cancelling') {
        // Expected exit due to cancellation
        await this.runRepo.updateStatus(runId, 'cancelled');
        this.emit('run-cancelled', { runId });
      }

      this.cleanup(runId);
    }

    this.emit('worker-exit', { runId, code, signal });
  }

  private cleanup(runId: string): void {
    const activeRun = this.activeRuns.get(runId);
    if (activeRun?.killTimer) {
      clearTimeout(activeRun.killTimer);
    }
    this.activeRuns.delete(runId);
  }
}
