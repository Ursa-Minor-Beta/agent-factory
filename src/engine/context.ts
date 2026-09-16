/**
 * ExecutionContext manages data flow between nodes during workflow execution.
 * Nodes store their outputs, which are accessed via {{node:id.path}} templates.
 */
export class ExecutionContext {
  // nodeId -> handleName -> value
  private outputs: Map<string, Map<string, unknown>> = new Map();

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
   * @deprecated Use {{node:id.path}} templates instead
   * Returns empty object - data flow now uses template interpolation
   */
  getAllInputs(_nodeId: string): Record<string, unknown> {
    return {};
  }
}
