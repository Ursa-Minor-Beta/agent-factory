import type { Agent } from '../domain/entities/Agent.js';
import type { Run, NodeErrorDetails } from '../domain/entities/Run.js';
import type { IRunRepository } from '../domain/interfaces/repositories/IRunRepository.js';
import { ExecutionContext } from './context.js';
import { topologicalSort, validateWorkflow } from './graph.js';
import { getNode, type ProviderConfig, type ExecutionOptions } from './nodes/index.js';
import { NodeExecutionError } from '../utils/errors.js';

export interface ExecutorOptions {
  providers: ProviderConfig;
}

export interface InternalExecutionOptions extends ExecutionOptions {
  // All fields from ExecutionOptions
}

interface InternalResult {
  output: Record<string, unknown>;
  status: 'completed' | 'failed';
  error?: string;
}

export class WorkflowExecutor {
  constructor(private runRepo: IRunRepository) {}

  /**
   * Check if a node should be skipped due to being in an unselected if-else branch
   */
  private shouldSkipNode(
    nodeId: string,
    edges: Agent['edges'],
    context: ExecutionContext,
    skippedNodes: Set<string>
  ): boolean {
    // Find all incoming edges to this node
    const incomingEdges = edges.filter((e) => e.target === nodeId);

    for (const edge of incomingEdges) {
      // If source node was skipped, this node should also be skipped
      if (skippedNodes.has(edge.source)) {
        return true;
      }

      // Check if this edge comes from an if-else node's true/false output
      if (edge.sourceHandle === 'true' || edge.sourceHandle === 'false') {
        const sourceOutputs = context.getNodeOutputs(edge.source);
        const value = sourceOutputs[edge.sourceHandle];

        // If the if-else branch output is null/undefined, skip this node
        if (value === null || value === undefined) {
          return true;
        }
      }
    }

    return false;
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
        run = (await this.runRepo.complete(run.id, result.output))!;
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
        run = (await this.runRepo.complete(run.id, result.output))!;
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
    };

    // Track skipped nodes (nodes in unselected if-else branches)
    const skippedNodes = new Set<string>();

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

          // Update node state to completed
          await this.runRepo.updateNodeState(runId, nodeId, {
            status: 'completed',
            input: nodeInputs,
            output: result.outputs,
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
            input: nodeInputs,
            error: errorMessage,
            errorDetails,
            completedAt: new Date(),
          });

          return { output: {}, status: 'failed', error: errorMessage };
        }
      }

      // Get output from output nodes
      const outputNodes = agent.nodes.filter((n) => n.type === 'output');
      const output: Record<string, unknown> = {};

      for (const outputNode of outputNodes) {
        const nodeOutputs = context.getNodeOutputs(outputNode.id);
        const key = (outputNode.data.name as string) ?? outputNode.id;
        output[key] = nodeOutputs.value;
      }

      return { output, status: 'completed' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { output: {}, status: 'failed', error: errorMessage };
    }
  }
}
