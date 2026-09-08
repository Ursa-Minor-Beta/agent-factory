import { Run, CreateRunDTO, RunStatus, NodeState } from '../../entities/Run.js';

export interface IRunRepository {
  findById(id: string): Promise<Run | null>;
  findByAgentId(agentId: string, limit?: number): Promise<Run[]>;
  findByUserId(userId: string, limit?: number): Promise<Run[]>;
  findAll(options?: { userId?: string; limit?: number }): Promise<Run[]>;
  create(data: CreateRunDTO): Promise<Run>;
  updateStatus(id: string, status: RunStatus, error?: string | null): Promise<Run | null>;
  updateNodeState(id: string, nodeId: string, state: Partial<NodeState>): Promise<Run | null>;
  setOutput(id: string, output: Record<string, unknown>): Promise<Run | null>;
  complete(id: string, output: Record<string, unknown>): Promise<Run | null>;
  fail(id: string, error: string): Promise<Run | null>;
}
