import type { Agent } from '../domain/entities/Agent.js';
import type { Run, NodeErrorDetails, RunTrigger } from '../domain/entities/Run.js';
import type { IRunRepository } from '../domain/interfaces/repositories/IRunRepository.js';
import type { IFileRepository } from '../domain/interfaces/repositories/IFileRepository.js';
import { ExecutionContext } from './context.js';
import { topologicalSort, validateWorkflow, extractRequiredOutputPaths } from './graph.js';
import { getNode, type ProviderConfig, type ExecutionOptions } from './nodes/index.js';
import { NodeExecutionError } from '../utils/errors.js';
import { stripBase64ForStorage } from '../utils/file-extractor.js';

/**
 * Safely clone an object, replacing circular references with '[Circular]'
 * and functions with '[Function]'. Preserves Date objects.
 * This is needed before saving to MongoDB which doesn't handle circular refs
 */
function safeClone<T>(obj: T, seen = new WeakSet<object>()): T {
  if (obj === null || typeof obj !== 'object') {
    // Handle functions
    if (typeof obj === 'function') {
      return '[Function]' as unknown as T;
    }
    return obj;
  }

  // Preserve Date objects
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

export interface ExecutorOptions {
  providers: ProviderConfig;
}

export interface InternalExecutionOptions extends ExecutionOptions {
  // Parent-child tracking
  parentRunId?: string;
  triggeredBy?: RunTrigger;
}

interface InternalResult {
  output: Record<string, unknown>;
  status: 'completed' | 'failed';
  error?: string;
  files?: string[];
}

export class WorkflowExecutor {
  constructor(
    private runRepo: IRunRepository,
    private fileRepo?: IFileRepository
  ) {}

  /**
   * Execute a workflow and create a run record
   */
  async execute(
    agent: Agent,
    input: Record<string, unknown>,
    userId: string,
    options: ExecutorOptions & Partial<InternalExecutionOptions>
  ): Promise<Run> {
    // Validate workflow
    const validation = validateWorkflow(agent.nodes);
    if (!validation.valid) {
      throw new Error(`Invalid workflow: ${validation.errors.join(', ')}`);
    }

    // Create run record
    let run = await this.runRepo.create({
      agentId: agent.id,
      userId,
      input,
    });

    // Update status to running
    run = (await this.runRepo.updateStatus(run.id, 'running'))!;

    // Initialize node states
    for (const node of agent.nodes) {
      await this.runRepo.updateNodeState(run.id, node.id, {
        status: 'pending',
        input: null,
        output: null,
        error: null,
        startedAt: null,
        completedAt: null,
      });
    }

    try {
      const result = await this.executeWorkflow(agent, input, userId, run.id, options);

      if (result.status === 'completed') {
        run = (await this.runRepo.complete(run.id, result.output, result.files))!;
      } else {
        run = (await this.runRepo.fail(run.id, result.error ?? 'Unknown error'))!;
      }

      return run;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      run = (await this.runRepo.fail(run.id, errorMessage))!;
      return run;
    }
  }

  /**
   * Execute a workflow internally (for sub-agent calls)
   * Creates a child run record linked to parent - used by AgentNode and tool calls
   */
  async executeInternal(
    agent: Agent,
    input: Record<string, unknown>,
    userId: string,
    options: InternalExecutionOptions
  ): Promise<Run> {
    // Validate workflow
    const validation = validateWorkflow(agent.nodes);
    if (!validation.valid) {
      throw new Error(`Invalid workflow: ${validation.errors.join(', ')}`);
    }

    // Create a child run record linked to parent
    let run = await this.runRepo.create({
      agentId: agent.id,
      userId,
      input,
      parentRunId: options.parentRunId,
      triggeredBy: options.triggeredBy,
    });

    run = (await this.runRepo.updateStatus(run.id, 'running'))!;

    try {
      const result = await this.executeWorkflow(agent, input, userId, run.id, options);

      if (result.status === 'completed') {
        run = (await this.runRepo.complete(run.id, result.output, result.files))!;
      } else {
        run = (await this.runRepo.fail(run.id, result.error ?? 'Unknown error'))!;
      }

      return run;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      run = (await this.runRepo.fail(run.id, errorMessage))!;
      return run;
    }
  }

  /**
   * Core workflow execution logic
   */
  private async executeWorkflow(
    agent: Agent,
    input: Record<string, unknown>,
    userId: string,
    runId: string,
    options: ExecutorOptions & Partial<InternalExecutionOptions>
  ): Promise<InternalResult> {
    const context = new ExecutionContext();
    const executionOrder = topologicalSort(agent.nodes);

    // Build full execution options
    const execOptions: ExecutionOptions = {
      providers: options.providers,
      workflowInput: input,
      agentRepo: options.agentRepo,
      runRepo: options.runRepo ?? this.runRepo,
      callStack: options.callStack,
      userId: options.userId ?? userId,
      currentRunId: runId,
      sessionId: options.sessionId,
      messageRepo: options.messageRepo,
      resolvedSecrets: options.resolvedSecrets,
    };

    try {
      // Execute nodes in order
      for (const nodeId of executionOrder) {
        const node = agent.nodes.find((n) => n.id === nodeId);
        if (!node) continue;

        // Update node state to running with input data
        await this.runRepo.updateNodeState(runId, nodeId, {
          status: 'running',
          input: safeClone(node.data),
          startedAt: new Date(),
        });

        const nodeHandler = getNode(node.type);

        // Compute which output paths downstream nodes need (for SSE early termination)
        const requiredOutputPaths = extractRequiredOutputPaths(agent.nodes, nodeId);
        const nodeExecOptions = requiredOutputPaths.length > 0
          ? { ...execOptions, requiredOutputPaths, fileRepo: this.fileRepo }
          : { ...execOptions, fileRepo: this.fileRepo };

        try {
          const result = await nodeHandler.execute(node, context, nodeExecOptions);

          // Keep raw output in context (including base64) for downstream nodes
          // This allows LLM nodes to use images for vision, etc.
          // File extraction happens only at output node when needed

          // For MongoDB storage, strip base64 to avoid bloating the run document
          const outputForStorage = result.outputs && typeof result.outputs === 'object'
            ? stripBase64ForStorage(result.outputs as Record<string, unknown>)
            : result.outputs;

          // Update node state to completed
          // Use safeClone to handle circular references before saving to MongoDB
          await this.runRepo.updateNodeState(runId, nodeId, {
            status: 'completed',
            output: safeClone(outputForStorage),
            state: safeClone(result.state),
            files: result.files,
            completedAt: new Date(),
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);

          // Build error details for debugging
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

          // Update node state to failed (include state if available from error)
          const errorState =
            error instanceof NodeExecutionError ? safeClone(error.state) : undefined;
          await this.runRepo.updateNodeState(runId, nodeId, {
            status: 'failed',
            error: errorMessage,
            errorDetails,
            state: errorState,
            completedAt: new Date(),
          });

          return { output: {}, status: 'failed', error: errorMessage };
        }
      }

      // Get output from output nodes - store references instead of duplicating data
      const outputNodes = agent.nodes.filter((n) => n.type === 'output');
      const output: Record<string, unknown> = {};

      for (const outputNode of outputNodes) {
        const key = (outputNode.data?.name as string) ?? outputNode.id;
        // Store reference to node output instead of actual value
        output[key] = `nodeRef:${outputNode.id}:value`;
      }

      // Collect all file refs from node states
      const run = await this.runRepo.findById(runId);
      const allFiles: string[] = [];
      if (run?.nodeStates) {
        for (const nodeState of Object.values(run.nodeStates)) {
          if (nodeState.files && nodeState.files.length > 0) {
            allFiles.push(...nodeState.files);
          }
        }
      }

      return { output, status: 'completed', files: allFiles.length > 0 ? allFiles : undefined };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { output: {}, status: 'failed', error: errorMessage };
    }
  }
}
