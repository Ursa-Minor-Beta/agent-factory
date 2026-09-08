import type { WorkflowNode, WorkflowEdge } from '../domain/entities/Agent.js';

export class CycleError extends Error {
  constructor(message = 'Workflow contains a cycle') {
    super(message);
    this.name = 'CycleError';
  }
}

/**
 * Build adjacency list from nodes and edges
 */
export function buildAdjacencyList(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
): Map<string, string[]> {
  const adjacency = new Map<string, string[]>();

  // Initialize all nodes
  for (const node of nodes) {
    adjacency.set(node.id, []);
  }

  // Add edges
  for (const edge of edges) {
    const targets = adjacency.get(edge.source);
    if (targets) {
      targets.push(edge.target);
    }
  }

  return adjacency;
}

/**
 * Topological sort using Kahn's algorithm
 * Returns nodes in execution order (dependencies first)
 * Throws CycleError if graph contains a cycle
 */
export function topologicalSort(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
): string[] {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const inDegree = new Map<string, number>();
  const adjacency = buildAdjacencyList(nodes, edges);

  // Initialize in-degrees
  for (const nodeId of nodeIds) {
    inDegree.set(nodeId, 0);
  }

  // Calculate in-degrees
  for (const edge of edges) {
    if (nodeIds.has(edge.target)) {
      inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
    }
  }

  // Queue nodes with no incoming edges
  const queue: string[] = [];
  for (const [nodeId, degree] of inDegree) {
    if (degree === 0) {
      queue.push(nodeId);
    }
  }

  const result: string[] = [];

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    result.push(nodeId);

    // Reduce in-degree of neighbors
    const neighbors = adjacency.get(nodeId) ?? [];
    for (const neighbor of neighbors) {
      const newDegree = (inDegree.get(neighbor) ?? 0) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) {
        queue.push(neighbor);
      }
    }
  }

  // Check for cycle
  if (result.length !== nodeIds.size) {
    throw new CycleError();
  }

  return result;
}

/**
 * Validate workflow structure
 */
export function validateWorkflow(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const nodeIds = new Set(nodes.map((n) => n.id));

  // Check for required input node
  const inputNodes = nodes.filter((n) => n.type === 'input');
  if (inputNodes.length === 0) {
    errors.push('Workflow must have at least one input node');
  }

  // Check for required output node
  const outputNodes = nodes.filter((n) => n.type === 'output');
  if (outputNodes.length === 0) {
    errors.push('Workflow must have at least one output node');
  }

  // Check edges reference valid nodes
  for (const edge of edges) {
    if (!nodeIds.has(edge.source)) {
      errors.push(`Edge references non-existent source node: ${edge.source}`);
    }
    if (!nodeIds.has(edge.target)) {
      errors.push(`Edge references non-existent target node: ${edge.target}`);
    }
  }

  // Check for cycles
  try {
    topologicalSort(nodes, edges);
  } catch (e) {
    if (e instanceof CycleError) {
      errors.push('Workflow contains a cycle');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
