import type { RunUsage } from '../../engine/nodes/llm/types.js';
import type { NodeType } from './Agent.js';

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
  nodeType?: NodeType;
  // Provider config used for the LLM call (llm nodes only)
  providerConfig?: { id: string; name: string };
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

/**
 * What started a run.
 * Child runs: 'agent_node' | 'tool_call' (always paired with parentRunId).
 * Root runs: 'chat' | 'api' | 'schedule'. Runs created before this field existed have no trigger.
 */
export type RunTrigger =
  | { triggerType: 'agent_node'; nodeId: string }
  | { triggerType: 'tool_call'; nodeId: string; toolName?: string }
  | { triggerType: 'chat'; sessionId?: string }
  | { triggerType: 'api' }
  | { triggerType: 'webhook'; webhookId: string }
  | { triggerType: 'schedule'; scheduleId: string; scheduledFor: Date };

export type RunTriggerType = RunTrigger['triggerType'];

export const RUN_TRIGGER_TYPES = ['agent_node', 'tool_call', 'chat', 'api', 'schedule', 'webhook'] as const satisfies readonly RunTriggerType[];

export interface Run {
  id: string;
  agentId: string;
  /** Agent name (populated via aggregation) */
  agentName?: string;
  userId: string;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  files?: string[]; // All file refs from the run: "inner:<fileId>:<fieldName>"
  status: RunStatus;
  nodeStates: Record<string, NodeState>;
  error: string | null;
  startedAt: Date;
  completedAt: Date | null;
  sessionId?: string;
  // Parent-child relationship
  parentRunId?: string;
  triggeredBy?: RunTrigger;
  // Aggregated children (populated by queries, not stored)
  childRuns?: Run[];
  // Cumulative LLM usage by provider
  usage?: RunUsage;
}

/**
 * Lightweight run summary for list views.
 * Excludes heavy fields: input, output, nodeStates.
 */
export interface RunSummary {
  id: string;
  agentId: string;
  /** Agent name (populated via aggregation) */
  agentName?: string;
  userId: string;
  status: RunStatus;
  error: string | null;
  startedAt: Date;
  completedAt: Date | null;
  sessionId?: string;
  // Parent-child relationship
  parentRunId?: string;
  triggeredBy?: RunTrigger;
  // For parent runs in lists - just child IDs, not full data
  childRunIds?: string[];
  // Cumulative LLM usage by provider
  usage?: RunUsage;
}

export interface CreateRunDTO {
  agentId: string;
  userId: string;
  input: Record<string, unknown>;
  sessionId?: string;
  parentRunId?: string;
  triggeredBy?: RunTrigger;
}
