import type { WorkflowNode } from '../../domain/entities/Agent.js';
import type { ExecutionContext } from '../context.js';
import { BaseNode, type NodeExecutionResult, type ExecutionOptions } from './base.js';

/**
 * JS Transform node - Execute JavaScript code to transform data
 */
export class JsNode extends BaseNode {
  readonly type = 'js';

  async execute(
    node: WorkflowNode,
    context: ExecutionContext,
    _options: ExecutionOptions
  ): Promise<NodeExecutionResult> {
    const code = (node.data.code as string) ?? 'return input;';
    const input = context.getAllInputs(node.id);

    // Create a sandboxed function
    // The function receives 'input' and should return the output
    const fn = new Function('input', code);

    let output: unknown;
    try {
      output = fn(input.input ?? input);
    } catch (error) {
      throw new Error(
        `JS node execution failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    const outputs = { output };
    context.setOutput(node.id, 'output', output);

    return { outputs };
  }
}
