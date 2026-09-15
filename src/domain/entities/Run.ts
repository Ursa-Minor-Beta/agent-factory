export type RunStatus = 'pending' | 'running' | 'completed' | 'failed';
export type NodeStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface NodeErrorDetails {
  message: string;
  stack?: string;
  request?: {
    url?: string;
    method?: string;
    body?: unknown;
  };
  response?: {
    status?: number;
    statusText?: string;
    body?: string;
  };
  cause?: string;
}

export interface NodeState {
  status: NodeStatus;
  input: unknown;
  output: unknown;
  state?: unknown;
  files?: string[]; // Format: "inner:<fileId>:<fieldName>"
  error: string | null;
  errorDetails?: NodeErrorDetails | null;
  startedAt: Date | null;
  completedAt: Date | null;
}

export interface Run {
  id: string;
  agentId: string;
  userId: string;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  files?: string[]; // All file refs from the run: "inner:<fileId>:<fieldName>"
  status: RunStatus;
  nodeStates: Record<string, NodeState>;
  error: string | null;
  startedAt: Date;
  completedAt: Date | null;
}

export interface CreateRunDTO {
  agentId: string;
  userId: string;
  input: Record<string, unknown>;
}
