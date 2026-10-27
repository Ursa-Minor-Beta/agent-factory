export interface BranchControl {
  branchNodeId: string;
  activeBranch: string;
  activeNodes: string[];
  allBranchNodes: string[];
}

export interface TempFile {
  mimeType: string;
  data: string;
  field: string;
}

/**
 * ExecutionContext manages data flow between nodes during workflow execution.
 * Nodes store their outputs, which are accessed via {{node:id.path}} templates.
 * Also stores temporary files (base64 data) until they're persisted by Output nodes.
 */
export class ExecutionContext {
  // nodeId -> handleName -> value
  private outputs: Map<string, Map<string, unknown>> = new Map();
  // branchNodeId -> BranchControl (for efficient branch execution control)
  private branchControls: Map<string, BranchControl> = new Map();
  // tempRef -> file data (base64 kept in context for downstream nodes)
  // nodeIds skipped during this run (for downstream skip propagation)
  private skippedNodes: Set<string> = new Set();
  // nodeIds executed on an active branch path (branch target or downstream of one)
  private activeBranchPathNodes: Set<string> = new Set();
  private tempFiles: Map<string, TempFile> = new Map();

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
   * Check if a node is listed in an active branch of any branch control.
   */
  isInActiveBranch(nodeId: string): boolean {
    for (const control of this.branchControls.values()) {
      if (control.activeNodes.includes(nodeId)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if at least one dependency is on an active branch path.
   * Allows merge nodes after a branch to run with whichever branch executed.
   */
  hasActiveBranchInput(dependencies: Set<string>): boolean {
    return [...dependencies].some((dep) => this.activeBranchPathNodes.has(dep));
  }

  /**
   * Resolve skip reason for a node, or null if it should execute.
   * A node is skipped if it is in an inactive branch, or if ANY dependency
   * was skipped and NO dependency comes from an active branch path.
   * Skipped nodes are recorded so propagation works transitively;
   * executed nodes on an active branch path are recorded for merge detection.
   */
  getSkipReason(nodeId: string, dependencies: Set<string>): string | null {
    let reason: string | null = null;
    const deps = [...dependencies];

    if (this.shouldSkipNode(nodeId)) {
      reason = 'Not in active branch';
    }
    else if (deps.some((dep) => this.skippedNodes.has(dep)) && !this.hasActiveBranchInput(dependencies)) {
      reason = 'Dependency skipped';
    }

    if (reason) {
      this.skippedNodes.add(nodeId);
    }
    else if (this.isInActiveBranch(nodeId) || this.hasActiveBranchInput(dependencies)) {
      this.activeBranchPathNodes.add(nodeId);
    }
    return reason;
  }

  /**
   * Store a temporary file (base64 data) in context
   * Temp refs format: {{temp:nodeId:index}}
   */
  storeTempFile(ref: string, file: TempFile): void {
    this.tempFiles.set(ref, file);
  }

  /**
   * Get a temporary file from context
   */
  getTempFile(ref: string): TempFile | undefined {
    return this.tempFiles.get(ref);
  }

  /**
   * Get all temp files (for debugging/inspection)
   */
  getAllTempFiles(): Map<string, TempFile> {
    return this.tempFiles;
  }

  /**
   * @deprecated Use {{node:id.path}} templates instead
   * Returns empty object - data flow now uses template interpolation
   */
  getAllInputs(_nodeId: string): Record<string, unknown> {
    return {};
  }
}
