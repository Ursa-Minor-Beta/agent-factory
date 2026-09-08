import type { WorkflowNode } from '../../domain/entities/Agent.js';
import type { ExecutionContext } from '../context.js';
import { BaseNode, type NodeExecutionResult, type ExecutionOptions } from './base.js';

/**
 * Output node - Collects final workflow results
 */
export class OutputNode extends BaseNode {
  readonly type = 'output';

  async execute(
    node: WorkflowNode,
    context: ExecutionContext,
    _options: ExecutionOptions
  ): Promise<NodeExecutionResult> {
    // Get all inputs connected to this output node
    const inputs = context.getAllInputs(node.id);

    // The output is whatever is connected to this node
    const outputs = { value: inputs['value'] ?? inputs };

    // Store in context
    context.setOutput(node.id, 'value', outputs.value);

    return { outputs };
  }
}
