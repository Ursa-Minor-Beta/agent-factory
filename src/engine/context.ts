import type { WorkflowEdge } from '../domain/entities/Agent.js';

/**
 * ExecutionContext manages data flow between nodes during workflow execution.
 * Each node stores its outputs, and inputs are resolved from connected edges.
 */
export class ExecutionContext {
  // nodeId -> handleName -> value
  private outputs: Map<string, Map<string, unknown>> = new Map();
  private edges: WorkflowEdge[];

  constructor(edges: WorkflowEdge[]) {
    this.edges = edges;
  }

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
   * Get all outputs from a node
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
   * Get input for a specific handle by following the edge connection
   */
  getInput(nodeId: string, handle: string): unknown {
    // Find edge that connects to this node's input handle
    const edge = this.edges.find(
      (e) => e.target === nodeId && e.targetHandle === handle
    );

    if (!edge) {
      return undefined;
    }

    // Get output from the source node
    const sourceOutputs = this.outputs.get(edge.source);
    if (!sourceOutputs) {
      return undefined;
    }

    return sourceOutputs.get(edge.sourceHandle);
  }

  /**
   * Get all inputs for a node by resolving all incoming edges
   */
  getAllInputs(nodeId: string): Record<string, unknown> {
    const inputs: Record<string, unknown> = {};

    // Find all edges targeting this node
    const incomingEdges = this.edges.filter((e) => e.target === nodeId);

    for (const edge of incomingEdges) {
      const sourceOutputs = this.outputs.get(edge.source);
      if (sourceOutputs) {
        const value = sourceOutputs.get(edge.sourceHandle);
        if (value !== undefined) {
          inputs[edge.targetHandle] = value;
        }
      }
    }

    return inputs;
  }
}
