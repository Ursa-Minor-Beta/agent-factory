import type { WorkflowNode } from '../domain/entities/Agent.js';

export class CycleError extends Error {
  constructor(message = 'Workflow contains a cycle') {
    super(message);
    this.name = 'CycleError';
  }
}

/**
 * Keys to skip when extracting node refs (may contain example templates)
 */
const SKIP_KEYS = new Set(['systemPrompt', 'description']);

/**
 * Extract node IDs referenced in {{node:id.path}} templates from any string value
 */
function extractNodeRefs(value: unknown, key?: string): Set<string> {
  const refs = new Set<string>();

  // Skip keys that may contain example templates
  if (key && SKIP_KEYS.has(key)) {
    return refs;
  }

  if (typeof value === 'string') {
    const regex = /\{\{node:([^.}]+)\./g;
    let match;
    while ((match = regex.exec(value)) !== null) {
      refs.add(match[1]);
    }
  } else if (Array.isArray(value)) {
    for (const item of value) {
      for (const ref of extractNodeRefs(item)) {
        refs.add(ref);
      }
    }
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      for (const ref of extractNodeRefs(v, k)) {
        refs.add(ref);
      }
    }
  }

  return refs;
}

/**
 * Extract dependencies from a node's data by scanning for {{node:id...}} templates
 */
export function extractTemplateDependencies(node: WorkflowNode): Set<string> {
  return extractNodeRefs(node.data);
}

/**
 * Build adjacency list from nodes by extracting template dependencies
 * Dependencies flow from referenced node → referencing node
 */
export function buildAdjacencyList(nodes: WorkflowNode[]): Map<string, string[]> {
  const adjacency = new Map<string, string[]>();
  const nodeIds = new Set(nodes.map((n) => n.id));

  // Initialize all nodes
  for (const node of nodes) {
    adjacency.set(node.id, []);
  }

  // Build dependencies from templates
  for (const node of nodes) {
    const deps = extractTemplateDependencies(node);
    for (const depId of deps) {
      // depId must execute before node.id
      // So depId -> node.id in the adjacency list
      if (nodeIds.has(depId)) {
        const targets = adjacency.get(depId);
        if (targets && !targets.includes(node.id)) {
          targets.push(node.id);
        }
      }
    }
  }

  return adjacency;
}

/**
 * Topological sort using Kahn's algorithm
 * Returns nodes in execution order (dependencies first)
 * Throws CycleError if graph contains a cycle
 */
export function topologicalSort(nodes: WorkflowNode[]): string[] {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const inDegree = new Map<string, number>();
  const adjacency = buildAdjacencyList(nodes);

  // Initialize in-degrees
  for (const nodeId of nodeIds) {
    inDegree.set(nodeId, 0);
  }

  // Calculate in-degrees from adjacency list
  for (const [, targets] of adjacency) {
    for (const target of targets) {
      inDegree.set(target, (inDegree.get(target) ?? 0) + 1);
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
export function validateWorkflow(nodes: WorkflowNode[]): { valid: boolean; errors: string[] } {
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

  // Check template references point to valid nodes
  for (const node of nodes) {
    const deps = extractTemplateDependencies(node);
    for (const depId of deps) {
      if (!nodeIds.has(depId)) {
        errors.push(`Node "${node.id}" references non-existent node: ${depId}`);
      }
    }
  }

  // Check for cycles
  try {
    topologicalSort(nodes);
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
