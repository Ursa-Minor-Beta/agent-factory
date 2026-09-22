export type RunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelling' | 'cancelled';
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

export type RunTriggerType = 'agent_node' | 'tool_call';

export interface RunTrigger {
  triggerType: RunTriggerType;
  nodeId: string;
  toolName?: string; // For tool_call type
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
  // Parent-child relationship
  parentRunId?: string;
  triggeredBy?: RunTrigger;
  // Aggregated children (populated by queries, not stored)
  childRuns?: Run[];
}

/**
 * Lightweight run summary for list views.
 * Excludes heavy fields: input, output, nodeStates.
 */
export interface RunSummary {
  id: string;
  agentId: string;
  userId: string;
  status: RunStatus;
  error: string | null;
  startedAt: Date;
  completedAt: Date | null;
  // Parent-child relationship
  parentRunId?: string;
  triggeredBy?: RunTrigger;
  // For parent runs in lists - just child IDs, not full data
  childRunIds?: string[];
}

export interface CreateRunDTO {
  agentId: string;
  userId: string;
  input: Record<string, unknown>;
  parentRunId?: string;
  triggeredBy?: RunTrigger;
}
