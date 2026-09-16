import type { WorkflowNode } from '../../domain/entities/Agent.js';
import type { ExecutionContext } from '../context.js';
import { BaseNode, type NodeExecutionResult, type ExecutionOptions } from './base.js';
import { interpolateAll } from './utils.js';

/**
 * If-Else node - Conditional branching based on expression evaluation
 *
 * Data config:
 *   - input: Template for input value, e.g., "{{node:http-1.response.status}}"
 *   - expression: JavaScript expression to evaluate (has access to `input` variable)
 *                 Examples: "input > 5", "input.status === 'approved'", "input.length > 0"
 *
 * Outputs:
 *   - true: Output when condition is true (passes input value)
 *   - false: Output when condition is false (passes input value)
 *   - result: The boolean result of the condition
 */
export class IfElseNode extends BaseNode {
  readonly type = 'if-else';

  async execute(
    node: WorkflowNode,
    context: ExecutionContext,
    options: ExecutionOptions
  ): Promise<NodeExecutionResult> {
    const expression = (node.data.expression as string) ?? 'true';

    // Get input from template or workflow input
    let input: unknown;
    if (node.data.input && typeof node.data.input === 'string') {
      const interpolated = interpolateAll(node.data.input, { context });
      try {
        input = JSON.parse(interpolated);
      } catch {
        input = interpolated;
      }
    } else {
      input = options.workflowInput;
    }

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
