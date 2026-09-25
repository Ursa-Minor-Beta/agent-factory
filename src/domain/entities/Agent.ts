export const NODE_TYPES = ['input', 'output', 'llm', 'http', 'js', 'agent', 'branch', 'memory-store', 'memory-search', 'memory-update', 'memory-delete'] as const;
export type NodeType = (typeof NODE_TYPES)[number];

export interface WorkflowNode {
  id: string;
  type: NodeType;
  data: Record<string, unknown>;
}

export interface Agent {
  id: string;
  userId: string;
  name: string;
  description: string;
  nodes: WorkflowNode[];
  /** System agent identifier - used by seeding to find/update system agents */
  systemName?: string;
  /** Default agent identifier - used by seeding to find/update default agents */
  defaultName?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAgentDTO {
  userId: string;
  name: string;
  description?: string;
  nodes?: WorkflowNode[];
  systemName?: string;
  defaultName?: string;
}

export interface UpdateAgentDTO {
  name?: string;
  description?: string;
  nodes?: WorkflowNode[];
}

export interface AgentQueryOptions {
  // Filters
  id?: string;
  name?: string; // contains (case-insensitive)
  description?: string; // contains (case-insensitive)
  createdAfter?: Date;
  createdBefore?: Date;

  // Sorting
  sortBy?: 'name' | 'createdAt' | 'updatedAt';
  sortOrder?: 'asc' | 'desc';

  // Pagination
  skip?: number;
  limit?: number;
}

export interface AgentListResult {
  agents: Agent[];
  total: number;
}
