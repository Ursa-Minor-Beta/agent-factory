/**
 * WorkerExecutor - Workflow executor designed for child process context.
 * Similar to WorkflowExecutor but with:
 * - Cancellation support (checks shouldStop before each node)
 * - Progress callbacks for IPC updates
 * - Works with pre-created run record
 */
import type { Agent } from '../../domain/entities/Agent.js';
import type { NodeState, NodeErrorDetails } from '../../domain/entities/Run.js';
import type { IRunRepository } from '../../domain/interfaces/repositories/IRunRepository.js';
import type { IFileRepository } from '../../domain/interfaces/repositories/IFileRepository.js';
import type { IAgentRepository } from '../../domain/interfaces/repositories/IAgentRepository.js';
import type { IMessageRepository } from '../../domain/interfaces/repositories/IMessageRepository.js';
import { ExecutionContext } from '../context.js';
import { topologicalSort, validateWorkflow } from '../graph.js';
import { getNode, type ProviderConfig, type ExecutionOptions } from '../nodes/index.js';
import { NodeExecutionError } from '../../utils/errors.js';
import { extractFiles, replaceFileRefsInObject, type ExtractedFile } from '../../utils/file-extractor.js';

/**
 * Safely clone an object, replacing circular references with '[Circular]'
 * and functions with '[Function]'. Preserves Date objects.
 */
function safeClone<T>(obj: T, seen = new WeakSet<object>()): T {
  if (obj === null || typeof obj !== 'object') {
    if (typeof obj === 'function') {
      return '[Function]' as unknown as T;
    }
    return obj;
  }

  if (obj instanceof Date) {
    return new Date(obj.getTime()) as unknown as T;
  }

  if (seen.has(obj as object)) {
    return '[Circular]' as unknown as T;
  }
  seen.add(obj as object);

  if (Array.isArray(obj)) {
    return obj.map((item) => safeClone(item, seen)) as unknown as T;
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = safeClone(value, seen);
  }
  return result as T;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface WorkerExecutorCallbacks {
  /** Check if execution should stop */
  shouldStop: () => boolean;
  /** Called when a node starts executing */
  onNodeStarted: (nodeId: string, nodeType: string) => void;
  /** Called when a node completes successfully */
  onNodeCompleted: (nodeId: string, nodeType: string, state: Partial<NodeState>) => void;
  /** Called when a node fails */
  onNodeFailed: (nodeId: string, nodeType: string, error: string) => void;
  /** Called when a node is skipped */
  onNodeSkipped: (nodeId: string, nodeType: string) => void;
}

export interface SessionContext {
  sessionId: string;
  messages?: ChatMessage[];
  /** LLM-managed notes/scratchpad - persists important context */
  notes?: string;
  /** Callback to persist updated notes */
  onNotesUpdate?: (notes: string) => Promise<void>;
  /** Max length for session notes (default: 8000) */
  maxNotesLength?: number;
}

export interface WorkerExecutorOptions {
  providers: ProviderConfig;
  resolvedSecrets?: Record<string, string>;
  /** Session context for chat-based execution */
  sessionContext?: SessionContext;
}

export interface WorkerExecutionResult {
  output: Record<string, unknown>;
  files?: string[];
  status: 'completed' | 'failed' | 'cancelled';
  error?: string;
}

export class WorkerExecutor {
  private stopRequested = false;

  constructor(
    private runRepo: IRunRepository,
    private fileRepo: IFileRepository | undefined,
    private agentRepo: IAgentRepository,
    private messageRepo: IMessageRepository,
    private callbacks: WorkerExecutorCallbacks
  ) {}

  /**
   * Request the executor to stop at the next opportunity
   */
  requestStop(): void {
    this.stopRequested = true;
  }

  /**
   * Check if stop has been requested
   */
  private shouldStop(): boolean {
    return this.stopRequested || this.callbacks.shouldStop();
  }

  /**
   * Execute a workflow for an existing run record
   */
  async execute(
    runId: string,
    agent: Agent,
    input: Record<string, unknown>,
    userId: string,
    options: WorkerExecutorOptions
  ): Promise<WorkerExecutionResult> {
    // Validate workflow
    const validation = validateWorkflow(agent.nodes);
    if (!validation.valid) {
      return {
        output: {},
        status: 'failed',
        error: `Invalid workflow: ${validation.errors.join(', ')}`,
      };
    }

    // Initialize node states
    for (const node of agent.nodes) {
      await this.runRepo.updateNodeState(runId, node.id, {
        status: 'pending',
        input: null,
        output: null,
        error: null,
        startedAt: null,
        completedAt: null,
      });
    }

    return this.executeWorkflow(agent, input, userId, runId, options);
  }

  /**
   * Core workflow execution logic
   */
  private async executeWorkflow(
    agent: Agent,
    input: Record<string, unknown>,
    userId: string,
    runId: string,
    options: WorkerExecutorOptions
  ): Promise<WorkerExecutionResult> {
    const context = new ExecutionContext();
    const executionOrder = topologicalSort(agent.nodes);

    // Build execution options
    const execOptions: ExecutionOptions = {
      providers: options.providers,
      workflowInput: input,
      runRepo: this.runRepo,
      agentRepo: this.agentRepo,
      messageRepo: this.messageRepo,
      userId,
      resolvedSecrets: options.resolvedSecrets,
      callStack: new Set([agent.id]), // Initialize call stack with current agent
      sessionId: options.sessionContext?.sessionId,
      messages: options.sessionContext?.messages,
      sessionNotes: options.sessionContext?.notes,
      onSessionNotesUpdate: options.sessionContext?.onNotesUpdate,
      maxNotesLength: options.sessionContext?.maxNotesLength,
    };

    // Track all files from this run
    const allFiles: string[] = [];

    try {
      for (const nodeId of executionOrder) {
        // Check for cancellation before each node
        if (this.shouldStop()) {
          await this.runRepo.updateStatus(runId, 'cancelled');
          return { output: {}, files: allFiles, status: 'cancelled' };
        }

        const node = agent.nodes.find((n) => n.id === nodeId);
        if (!node) continue;

        // Update node state to running with input data
        await this.runRepo.updateNodeState(runId, nodeId, {
          status: 'running',
          input: safeClone(node.data),
          startedAt: new Date(),
        });
        this.callbacks.onNodeStarted(nodeId, node.type);

        const nodeHandler = getNode(node.type);

        try {
          const result = await nodeHandler.execute(node, context, execOptions);

          // Check for cancellation after node execution
          if (this.shouldStop()) {
            await this.runRepo.updateStatus(runId, 'cancelled');
            return { output: {}, files: allFiles, status: 'cancelled' };
          }

          // Extract files from output and save to DB
          let finalOutput = result.outputs;
          let nodeFiles: string[] | undefined;

          if (this.fileRepo && result.outputs && typeof result.outputs === 'object') {
            const { cleanedOutput, files } = extractFiles(result.outputs);

            if (files.length > 0) {
              const savedFiles = await this.saveFiles(files, userId);
              nodeFiles = savedFiles;
              allFiles.push(...savedFiles);

              const fileIdMap = new Map<number, { id: string; field: string }>();
              files.forEach((f, idx) => {
                const ref = savedFiles[idx];
                if (ref) {
                  const parts = ref.split(':');
                  fileIdMap.set(idx, { id: parts[1] ?? '', field: f.field });
                }
              });
              finalOutput = replaceFileRefsInObject(cleanedOutput, fileIdMap);

              for (const [handle, value] of Object.entries(finalOutput)) {
                context.setOutput(nodeId, handle, value);
              }
            }
          }

          // Update node state to completed
          const nodeState: Partial<NodeState> = {
            status: 'completed',
            output: safeClone(finalOutput),
            state: safeClone(result.state),
            files: nodeFiles,
            completedAt: new Date(),
          };
          await this.runRepo.updateNodeState(runId, nodeId, nodeState);
          this.callbacks.onNodeCompleted(nodeId, node.type, nodeState);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);

          // Build error details
          let errorDetails: NodeErrorDetails | undefined;
          if (error instanceof NodeExecutionError) {
            errorDetails = {
              message: error.message,
              stack: error.stack,
              request: error.context.request,
              response: error.context.response,
              cause: error.originalError?.message,
            };
          } else if (error instanceof Error) {
            errorDetails = {
              message: error.message,
              stack: error.stack,
            };
          }

          // Update node state to failed
          await this.runRepo.updateNodeState(runId, nodeId, {
            status: 'failed',
            error: errorMessage,
            errorDetails,
            completedAt: new Date(),
          });
          this.callbacks.onNodeFailed(nodeId, node.type, errorMessage);

          await this.runRepo.fail(runId, errorMessage);
          return { output: {}, files: allFiles, status: 'failed', error: errorMessage };
        }
      }

      // Get output from output nodes
      const outputNodes = agent.nodes.filter((n) => n.type === 'output');
      const output: Record<string, unknown> = {};

      for (const outputNode of outputNodes) {
        const key = (outputNode.data?.name as string) ?? outputNode.id;
        output[key] = `nodeRef:${outputNode.id}:value`;
      }

      await this.runRepo.complete(runId, output, allFiles.length > 0 ? allFiles : undefined);
      return { output, files: allFiles, status: 'completed' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.runRepo.fail(runId, errorMessage);
      return { output: {}, files: allFiles, status: 'failed', error: errorMessage };
    }
  }

  /**
   * Save extracted files to DB and return file references
   */
  private async saveFiles(files: ExtractedFile[], userId: string): Promise<string[]> {
    if (!this.fileRepo || files.length === 0) {
      return [];
    }

    const savedFiles = await this.fileRepo.createMany(
      files.map((f) => ({
        userId,
        name: f.field,
        mimeType: f.mimeType,
        data: f.data,
      }))
    );

    return savedFiles.map((f) => `inner:${f.id}:${f.name}`);
  }
}
