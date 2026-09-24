export interface BranchControl {
  branchNodeId: string;
  activeBranch: string;
  activeNodes: string[];
  allBranchNodes: string[];
}

/**
 * ExecutionContext manages data flow between nodes during workflow execution.
 * Nodes store their outputs, which are accessed via {{node:id.path}} templates.
 */
export class ExecutionContext {
  // nodeId -> handleName -> value
  private outputs: Map<string, Map<string, unknown>> = new Map();
  // branchNodeId -> BranchControl (for efficient branch execution control)
  private branchControls: Map<string, BranchControl> = new Map();

  /**
   * Store output from a node
   */
  setOutput(nodeId: string, handle: string, value: unknown): void {
    if (!this.outputs.has(nodeId)) {
      this.outputs.set(nodeId, new Map());
    }
    this.outputs.get(nodeId)!.set(handle, value);
  }

  /**
   * Get all outputs from a node (used by template interpolation)
   */
  getNodeOutputs(nodeId: string): Record<string, unknown> {
    const nodeOutputs = this.outputs.get(nodeId);
    if (!nodeOutputs) return {};

    const result: Record<string, unknown> = {};
    nodeOutputs.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  /**
   * Get a specific output from a node
   */
  getOutput(nodeId: string, handle: string): unknown {
    const nodeOutputs = this.outputs.get(nodeId);
    if (!nodeOutputs) return undefined;
    return nodeOutputs.get(handle);
  }

  /**
   * Store branch control metadata from a branch node
   */
  setBranchControl(branchNodeId: string, control: BranchControl): void {
    this.branchControls.set(branchNodeId, control);
  }

  /**
   * Check if a node should be skipped based on branch control.
   * A node is skipped if ANY branch control marks it as inactive.
   * O(1) lookup instead of searching through all outputs.
   */
  shouldSkipNode(nodeId: string): boolean {
    for (const control of this.branchControls.values()) {
      if (control.allBranchNodes.includes(nodeId) &&
          !control.activeNodes.includes(nodeId)) {
        return true;
      }
    }
    return false;
  }

  /**
   * @deprecated Use {{node:id.path}} templates instead
   * Returns empty object - data flow now uses template interpolation
   */
  getAllInputs(_nodeId: string): Record<string, unknown> {
    return {};
  }
}
