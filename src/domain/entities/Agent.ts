export const NODE_TYPES = ['input', 'output', 'llm', 'http', 'js', 'agent', 'if-else'] as const;
export type NodeType = (typeof NODE_TYPES)[number];

export interface WorkflowNode {
  id: string;
  type: NodeType;
  data: Record<string, unknown>;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
}

export interface WorkflowVariable {
  name: string;
  type: 'string' | 'number' | 'boolean';
  defaultValue: unknown;
}

export interface Agent {
  id: string;
  userId: string;
  name: string;
  description: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  variables: WorkflowVariable[];
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAgentDTO {
  userId: string;
  name: string;
  description?: string;
  nodes?: WorkflowNode[];
  edges?: WorkflowEdge[];
  variables?: WorkflowVariable[];
  isSystem?: boolean;
}

export interface UpdateAgentDTO {
  name?: string;
  description?: string;
  nodes?: WorkflowNode[];
  edges?: WorkflowEdge[];
  variables?: WorkflowVariable[];
}

export interface AgentQueryOptions {
  // Filters
  id?: string;
  name?: string; // contains (case-insensitive)
  description?: string; // contains (case-insensitive)
  isSystem?: boolean; // admin only
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
