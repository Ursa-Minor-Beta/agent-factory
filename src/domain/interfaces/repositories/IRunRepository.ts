import type { Run, RunSummary, CreateRunDTO, RunStatus, NodeState } from '../../entities/Run.js';

export interface RunQueryOptions {
  userId?: string;
  agentId?: string;
  status?: RunStatus;
  startedAfter?: Date;
  startedBefore?: Date;
  sortBy?: 'startedAt' | 'completedAt';
  sortOrder?: 'asc' | 'desc';
  skip?: number;
  limit?: number;
  // Filter and aggregation options
  parentOnly?: boolean; // Only return runs without parentRunId
  includeChildren?: boolean; // Aggregate child runs into parent
}

export interface RunQueryResult {
  runs: Run[];
  total: number;
}

export interface RunSummaryQueryResult {
  runs: RunSummary[];
  total: number;
}

export interface RunWithChildrenQueryOptions {
  userId?: string;
  agentId?: string;
  status?: RunStatus;
  startedAfter?: Date;
  startedBefore?: Date;
  sortBy?: 'startedAt' | 'completedAt';
  sortOrder?: 'asc' | 'desc';
  skip?: number;
  limit?: number;
}

export interface IRunRepository {
  findById(id: string): Promise<Run | null>;
  /**
   * Find run by ID with all child runs aggregated.
   * Returns run with childRuns populated (full child data).
   */
  findByIdWithChildren(id: string): Promise<Run | null>;
  findByAgentId(agentId: string, limit?: number): Promise<Run[]>;
  findByUserId(userId: string, limit?: number): Promise<Run[]>;
  findAll(options?: RunQueryOptions): Promise<RunQueryResult>;
  create(data: CreateRunDTO): Promise<Run>;
  updateStatus(id: string, status: RunStatus, error?: string | null): Promise<Run | null>;
  updateNodeState(id: string, nodeId: string, state: Partial<NodeState>): Promise<Run | null>;
  setOutput(id: string, output: Record<string, unknown>): Promise<Run | null>;
  complete(id: string, output: Record<string, unknown>, files?: string[]): Promise<Run | null>;
  fail(id: string, error: string): Promise<Run | null>;
  /**
   * Cancel a running execution.
   * Sets status to 'cancelling' if running, or 'cancelled' if pending.
   * Returns null if run not found or already completed/failed/cancelled.
   */
  cancel(id: string): Promise<Run | null>;
  /**
   * Find parent runs (no parentRunId) with their children aggregated.
   * Returns runs with childRuns populated.
   */
  findParentsWithChildren(options?: RunWithChildrenQueryOptions): Promise<RunQueryResult>;

  /**
   * Find all runs with summary projection (excludes input, output, nodeStates).
   * More efficient for list views.
   */
  findAllSummary(options?: RunQueryOptions): Promise<RunSummaryQueryResult>;

  /**
   * Find parent runs with child IDs only (not full child data).
   * Returns RunSummary with childRunIds populated.
   */
  findParentsWithChildIdsSummary(options?: RunWithChildrenQueryOptions): Promise<RunSummaryQueryResult>;
}
