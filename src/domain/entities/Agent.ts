export const NODE_TYPES = ['input', 'output', 'llm', 'http', 'js', 'agent', 'if-else'] as const;
export type NodeType = (typeof NODE_TYPES)[number];

export interface NodePosition {
  x: number;
  y: number;
}

export interface WorkflowNode {
  id: string;
  type: NodeType;
  position: NodePosition;
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

export const AGENT_STATUSES = ['draft', 'published'] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];

export interface Agent {
  id: string;
  userId: string;
  name: string;
  description: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  variables: WorkflowVariable[];
  status: AgentStatus;
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
  status?: AgentStatus;
}
