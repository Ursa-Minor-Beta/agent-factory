import type { WorkflowNode } from '../../domain/entities/Agent.js';
import type { ExecutionContext } from '../context.js';
import { BaseNode, type NodeExecutionResult, type ExecutionOptions } from './base.js';

/**
 * If-Else node - Conditional branching based on expression evaluation
 *
 * Inputs:
 *   - input: The value to evaluate and pass through
 *
 * Outputs:
 *   - true: Output when condition is true (passes input value)
 *   - false: Output when condition is false (passes input value)
 *
 * Data config:
 *   - expression: JavaScript expression to evaluate (has access to `input` variable)
 *                 Examples: "input > 5", "input.status === 'approved'", "input.length > 0"
 */
export class IfElseNode extends BaseNode {
  readonly type = 'if-else';

  async execute(
    node: WorkflowNode,
    context: ExecutionContext,
    _options: ExecutionOptions
  ): Promise<NodeExecutionResult> {
    const expression = (node.data.expression as string) ?? 'true';
    const inputs = context.getAllInputs(node.id);
    const input = inputs.input ?? inputs;

    // Evaluate the condition
    let conditionResult: boolean;
    try {
      const fn = new Function('input', `return Boolean(${expression})`);
      conditionResult = fn(input);
    } catch (error) {
      throw new Error(
        `If-Else condition evaluation failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    // Output to the appropriate branch
    const outputs: Record<string, unknown> = {
      true: null,
      false: null,
      result: conditionResult,
    };

    if (conditionResult) {
      outputs.true = input;
      context.setOutput(node.id, 'true', input);
    } else {
      outputs.false = input;
      context.setOutput(node.id, 'false', input);
    }

    // Also output the condition result for debugging/logging
    context.setOutput(node.id, 'result', conditionResult);

    return { outputs };
  }
}
