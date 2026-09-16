import type { WorkflowNode } from '../../domain/entities/Agent.js';
import type { ExecutionContext } from '../context.js';
import { BaseNode, type NodeExecutionResult, type ExecutionOptions } from './base.js';
import { interpolateAll } from './utils.js';

interface OutputNodeData {
  name?: string;
  value?: string; // Template like "{{node:llm-1.response}}"
}

/**
 * Output node - Collects final workflow results
 * Use data.value with {{node:id.path}} template to specify output source
 */
export class OutputNode extends BaseNode {
  readonly type = 'output';

  async execute(
    node: WorkflowNode,
    context: ExecutionContext,
    options: ExecutionOptions
  ): Promise<NodeExecutionResult> {
    const data = node.data as OutputNodeData;

    let value: unknown;

    if (data.value) {
      // Interpolate the value template
      const interpolated = interpolateAll(data.value, { context });

      // Try to parse as JSON if it looks like JSON
      try {
        value = JSON.parse(interpolated);
      } catch {
        value = interpolated;
      }
    } else {
      // Fallback: use workflow input
      value = options.workflowInput;
    }

    const outputs = { value };

    // Store in context
    context.setOutput(node.id, 'value', value);

    return { outputs };
  }
}
