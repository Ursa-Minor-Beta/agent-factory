import type { WorkflowNode } from '../../domain/entities/Agent.js';
import type { ExecutionContext } from '../context.js';
import { BaseNode, type NodeExecutionResult, type ExecutionOptions } from './base.js';
import { WorkflowExecutor } from '../executor.js';
import { resolveRunOutput } from '../../utils/node-ref.js';

interface AgentNodeData {
  agentId: string;
}

/**
 * Agent node - Execute another agent as a sub-workflow
 */
export class AgentNode extends BaseNode {
  readonly type = 'agent';

  async execute(
    node: WorkflowNode,
    context: ExecutionContext,
    options: ExecutionOptions
  ): Promise<NodeExecutionResult> {
    const data = node.data as unknown as AgentNodeData;
    const inputs = context.getAllInputs(node.id);

    if (!data.agentId) {
      throw new Error('Agent node requires agentId in data');
    }

    if (!options.agentRepo || !options.runRepo) {
      throw new Error('Agent node requires agentRepo and runRepo in options');
    }

    if (!options.userId) {
      throw new Error('Agent node requires userId in options');
    }

    // Check for circular call
    const callStack = options.callStack ?? new Set<string>();
    if (callStack.has(data.agentId)) {
      const chain = [...callStack, data.agentId].join(' → ');
      throw new Error(`Circular agent call detected: ${chain}`);
    }

    // Load the target agent
    const targetAgent = await options.agentRepo.findById(data.agentId);
    if (!targetAgent) {
      throw new Error(`Agent not found: ${data.agentId}`);
    }

    // Permission check - agent must belong to same user
    if (targetAgent.userId !== options.userId) {
      throw new Error(`Access denied to agent: ${data.agentId}`);
    }

    // Create new call stack with this agent
    const newCallStack = new Set(callStack);
    newCallStack.add(data.agentId);

    // Execute the sub-agent
    const executor = new WorkflowExecutor(options.runRepo);
    const subInput = (inputs.input ?? inputs) as Record<string, unknown>;
    const run = await executor.executeInternal(
      targetAgent,
      subInput,
      options.userId,
      {
        providers: options.providers,
        workflowInput: subInput,
        agentRepo: options.agentRepo,
        runRepo: options.runRepo,
        callStack: newCallStack,
        userId: options.userId,
      }
    );

    if (run.status === 'failed') {
      throw new Error(`Sub-agent failed: ${run.error}`);
    }

    // Resolve nodeRef references to actual values for downstream nodes
    const resolvedOutput = resolveRunOutput(run);
    const outputs = { output: resolvedOutput, run };
    context.setOutput(node.id, 'output', resolvedOutput);
    context.setOutput(node.id, 'run', run);

    return { outputs };
  }
}
