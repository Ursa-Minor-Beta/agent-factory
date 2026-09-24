import type { WorkflowNode } from '../../domain/entities/Agent.js';
import type { ExecutionContext } from '../context.js';
import { BaseNode, type NodeExecutionResult, type ExecutionOptions } from './base.js';
import { interpolateAll } from './utils.js';

/**
 * Branch node - Multi-way conditional branching with execution control
 *
 * Data config:
 *   - input: Template for input value, e.g., "{{node:input-1.score}}"
 *   - branches: Array of branch definitions with conditions and associated node IDs
 *
 * Branch definition:
 *   - name: Branch name (e.g., "pass", "fail")
 *   - condition: JavaScript expression to evaluate (has access to `input` variable)
 *   - nodes: Array of node IDs that belong to this branch
 *
 * Outputs:
 *   - activeBranch: Name of the branch that was activated
 *   - [branchName]: For each branch, outputs the input value if active, null otherwise
 *
 * Execution Control:
 *   - Only nodes in the active branch will execute
 *   - Nodes not listed in any branch always execute
 *   - Nodes in inactive branches are skipped
 */

interface BranchDefinition {
  name: string;
  condition: string;
  nodes: string[];
}

export class BranchNode extends BaseNode {
  readonly type = 'branch';

  async execute(
    node: WorkflowNode,
    context: ExecutionContext,
    options: ExecutionOptions
  ): Promise<NodeExecutionResult> {
    const branches = (node.data.branches as BranchDefinition[]) ?? [];

    if (branches.length === 0) {
      throw new Error('Branch node requires at least one branch definition');
    }

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

    // Evaluate branches in order and find the first matching one
    let activeBranch: BranchDefinition | null = null;
    for (const branch of branches) {
      try {
        const fn = new Function('input', `return Boolean(${branch.condition})`);
        const result = fn(input);
        if (result) {
          activeBranch = branch;
          break;
        }
      } catch (error) {
        throw new Error(
          `Branch condition evaluation failed for branch "${branch.name}": ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    if (!activeBranch) {
      throw new Error('No branch condition matched - add a default branch with condition "true"');
    }

    // Build outputs
    const outputs: Record<string, unknown> = {
      activeBranch: activeBranch.name,
    };

    // Set output for each branch (active gets input, others get null)
    for (const branch of branches) {
      const isActive = branch.name === activeBranch.name;
      outputs[branch.name] = isActive ? input : null;
      context.setOutput(node.id, branch.name, isActive ? input : null);
    }

    context.setOutput(node.id, 'activeBranch', activeBranch.name);

    // Store branch execution control in context (O(1) lookups for executor)
    context.setBranchControl(node.id, {
      branchNodeId: node.id,
      activeBranch: activeBranch.name,
      activeNodes: activeBranch.nodes,
      allBranchNodes: branches.flatMap((b) => b.nodes),
    });

    return { outputs };
  }
}
