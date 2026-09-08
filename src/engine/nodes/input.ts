import type { WorkflowNode } from '../../domain/entities/Agent.js';
import type { ExecutionContext } from '../context.js';
import { BaseNode, type NodeExecutionResult, type ExecutionOptions } from './base.js';

/**
 * Input node - Entry point for workflow data
 * Passes workflow input to subsequent nodes
 */
export class InputNode extends BaseNode {
  readonly type = 'input';

  async execute(
    node: WorkflowNode,
    context: ExecutionContext,
    options: ExecutionOptions
  ): Promise<NodeExecutionResult> {
    // Input node simply passes through the workflow input
    const outputs: Record<string, unknown> = {};

    // Get schema from node data to know which fields to extract
    const schema = (node.data.schema as Record<string, unknown>) ?? {};

    for (const fieldName of Object.keys(schema)) {
      outputs[fieldName] = options.workflowInput[fieldName];
    }

    // Also pass the entire input as 'value' for simple workflows
    outputs['value'] = options.workflowInput;

    // Store outputs in context
    for (const [handle, value] of Object.entries(outputs)) {
      context.setOutput(node.id, handle, value);
    }

    return { outputs };
  }
}
