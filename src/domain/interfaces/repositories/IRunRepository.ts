import { Run, CreateRunDTO, RunStatus, NodeState } from '../../entities/Run.js';

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
}

export interface RunQueryResult {
  runs: Run[];
  total: number;
}

export interface IRunRepository {
  findById(id: string): Promise<Run | null>;
  findByAgentId(agentId: string, limit?: number): Promise<Run[]>;
  findByUserId(userId: string, limit?: number): Promise<Run[]>;
  findAll(options?: RunQueryOptions): Promise<RunQueryResult>;
  create(data: CreateRunDTO): Promise<Run>;
  updateStatus(id: string, status: RunStatus, error?: string | null): Promise<Run | null>;
  updateNodeState(id: string, nodeId: string, state: Partial<NodeState>): Promise<Run | null>;
  setOutput(id: string, output: Record<string, unknown>): Promise<Run | null>;
  complete(id: string, output: Record<string, unknown>, files?: string[]): Promise<Run | null>;
  fail(id: string, error: string): Promise<Run | null>;
}
