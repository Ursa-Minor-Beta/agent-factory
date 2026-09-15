import type { Agent } from '../domain/entities/Agent.js';
import type { Run, NodeErrorDetails } from '../domain/entities/Run.js';
import type { IRunRepository } from '../domain/interfaces/repositories/IRunRepository.js';
import type { IFileRepository } from '../domain/interfaces/repositories/IFileRepository.js';
import { ExecutionContext } from './context.js';
import { topologicalSort, validateWorkflow } from './graph.js';
import { getNode, type ProviderConfig, type ExecutionOptions } from './nodes/index.js';
import { NodeExecutionError } from '../utils/errors.js';
import { extractFiles, replaceFileRefsInObject, type ExtractedFile } from '../utils/file-extractor.js';

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
  // All fields from ExecutionOptions
}

interface InternalResult {
  output: Record<string, unknown>;
  files: string[];
  status: 'completed' | 'failed';
  error?: string;
}

export class WorkflowExecutor {
  constructor(
    private runRepo: IRunRepository,
    private fileRepo?: IFileRepository
  ) {}

  /**
   * Check if a node should be skipped due to being in an unselected if-else branch
   *
   * A node should be skipped only if ALL incoming edges come from skipped sources.
   * This allows converging branches to work correctly - the node executes if at least
   * one branch reaches it.
   */
  private shouldSkipNode(
    nodeId: string,
    edges: Agent['edges'],
    context: ExecutionContext,
    skippedNodes: Set<string>
  ): boolean {
    // Find all incoming edges to this node
    const incomingEdges = edges.filter((e) => e.target === nodeId);

    // If no incoming edges, don't skip (e.g., input node)
    if (incomingEdges.length === 0) {
      return false;
    }

    // Check each incoming edge - if ANY edge comes from an active source, don't skip
    let hasActiveSource = false;

    for (const edge of incomingEdges) {
      // Check if source node was skipped
      if (skippedNodes.has(edge.source)) {
        continue; // This edge is inactive, check others
      }

      // Check if this edge comes from an if-else node's true/false output
      if (edge.sourceHandle === 'true' || edge.sourceHandle === 'false') {
        const sourceOutputs = context.getNodeOutputs(edge.source);
        const value = sourceOutputs[edge.sourceHandle];

        // If the if-else branch output is null/undefined, this edge is inactive
        if (value === null || value === undefined) {
          continue;
        }
      }

      // This edge has an active source
      hasActiveSource = true;
      break;
    }

    // Skip only if NO incoming edges are active
    return !hasActiveSource;
  }

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
    const validation = validateWorkflow(agent.nodes, agent.edges);
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
        run = (await this.runRepo.complete(run.id, result.output, result.files.length > 0 ? result.files : undefined))!;
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
   * Does not create a run record - used by AgentNode
   */
  async executeInternal(
    agent: Agent,
    input: Record<string, unknown>,
    userId: string,
    options: InternalExecutionOptions
  ): Promise<Run> {
    // Validate workflow
    const validation = validateWorkflow(agent.nodes, agent.edges);
    if (!validation.valid) {
      throw new Error(`Invalid workflow: ${validation.errors.join(', ')}`);
    }

    // Create a minimal run record for sub-agent
    let run = await this.runRepo.create({
      agentId: agent.id,
      userId,
      input,
    });

    run = (await this.runRepo.updateStatus(run.id, 'running'))!;

    try {
      const result = await this.executeWorkflow(agent, input, userId, run.id, options);

      if (result.status === 'completed') {
        run = (await this.runRepo.complete(run.id, result.output, result.files.length > 0 ? result.files : undefined))!;
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
    const context = new ExecutionContext(agent.edges);
    const executionOrder = topologicalSort(agent.nodes, agent.edges);

    // Build full execution options
    const execOptions: ExecutionOptions = {
      providers: options.providers,
      workflowInput: input,
      agentRepo: options.agentRepo,
      runRepo: options.runRepo ?? this.runRepo,
      callStack: options.callStack,
      userId: options.userId ?? userId,
      sessionId: options.sessionId,
      messageRepo: options.messageRepo,
      saveNotes: options.saveNotes,
      resolvedSecrets: options.resolvedSecrets,
    };

    // Track skipped nodes (nodes in unselected if-else branches)
    const skippedNodes = new Set<string>();
    // Track all files from this run
    const allFiles: string[] = [];

    try {
      // Execute nodes in order
      for (const nodeId of executionOrder) {
        const node = agent.nodes.find((n) => n.id === nodeId);
        if (!node) continue;

        // Check if this node should be skipped (connected to unselected if-else branch)
        const shouldSkip = this.shouldSkipNode(nodeId, agent.edges, context, skippedNodes);
        if (shouldSkip) {
          skippedNodes.add(nodeId);
          await this.runRepo.updateNodeState(runId, nodeId, {
            status: 'skipped',
            completedAt: new Date(),
          });
          continue;
        }

        // Update node state to running
        await this.runRepo.updateNodeState(runId, nodeId, {
          status: 'running',
          startedAt: new Date(),
        });

        const nodeHandler = getNode(node.type);
        const nodeInputs = context.getAllInputs(nodeId);

        try {
          const result = await nodeHandler.execute(node, context, execOptions);

          // Extract files from output and save to DB
          let finalOutput = result.outputs;
          let nodeFiles: string[] | undefined;

          if (this.fileRepo && result.outputs && typeof result.outputs === 'object') {
            const { cleanedOutput, files } = extractFiles(result.outputs);

            if (files.length > 0) {
              // Save files to DB
              const savedFiles = await this.saveFiles(files, userId);
              nodeFiles = savedFiles;
              allFiles.push(...savedFiles);

              // Replace placeholders with actual file refs
              const fileIdMap = new Map<number, { id: string; field: string }>();
              files.forEach((f, idx) => {
                const ref = savedFiles[idx];
                if (ref) {
                  const parts = ref.split(':');
                  fileIdMap.set(idx, { id: parts[1] ?? '', field: f.field });
                }
              });
              finalOutput = replaceFileRefsInObject(cleanedOutput, fileIdMap);

              // Update context with cleaned output (file references instead of base64)
              // This ensures downstream nodes receive file refs, not raw base64
              for (const [handle, value] of Object.entries(finalOutput)) {
                context.setOutput(nodeId, handle, value);
              }
            }
          }

          // Update node state to completed
          // Use safeClone to handle circular references before saving to MongoDB
          await this.runRepo.updateNodeState(runId, nodeId, {
            status: 'completed',
            input: safeClone(nodeInputs),
            output: safeClone(finalOutput),
            state: safeClone(result.state),
            files: nodeFiles,
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

          // Update node state to failed
          await this.runRepo.updateNodeState(runId, nodeId, {
            status: 'failed',
            input: safeClone(nodeInputs),
            error: errorMessage,
            errorDetails,
            completedAt: new Date(),
          });

          return { output: {}, files: allFiles, status: 'failed', error: errorMessage };
        }
      }

      // Get output from output nodes - store references instead of duplicating data
      const outputNodes = agent.nodes.filter((n) => n.type === 'output');
      const output: Record<string, unknown> = {};

      for (const outputNode of outputNodes) {
        const key = (outputNode.data.name as string) ?? outputNode.id;
        // Store reference to node output instead of actual value
        output[key] = `nodeRef:${outputNode.id}:value`;
      }

      return { output, files: allFiles, status: 'completed' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
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
