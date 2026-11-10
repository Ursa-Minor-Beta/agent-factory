import type {
  AgentSchedule,
  CreateAgentScheduleDTO,
  UpdateAgentScheduleDTO,
} from '../../entities/AgentSchedule.js';

export interface AgentScheduleQueryOptions {
  agentId?: string;
  /** Filter by workspace: undefined = all, null = global only, "<id>" = workspace only */
  workspaceId?: string | null;
  enabled?: boolean;
  sortBy?: 'name' | 'nextRunAt' | 'createdAt' | 'updatedAt';
  sortOrder?: 'asc' | 'desc';
}

export interface IAgentScheduleRepository {
  findById(id: string): Promise<AgentSchedule | null>;
  findByUserId(userId: string, options?: AgentScheduleQueryOptions): Promise<AgentSchedule[]>;
  /** Enabled schedules with nextRunAt <= now, earliest first */
  findDue(now: Date, limit: number): Promise<AgentSchedule[]>;
  /** Earliest nextRunAt among enabled schedules */
  findNextRunAt(): Promise<Date | null>;
  create(data: CreateAgentScheduleDTO): Promise<AgentSchedule>;
  update(id: string, data: UpdateAgentScheduleDTO): Promise<AgentSchedule | null>;
  /**
   * Delete schedules by id, agentId, workspaceId, or userId
   * @returns Number of deleted schedules
   */
  delete(options: { id?: string; agentId?: string; workspaceId?: string; userId?: string }): Promise<number>;
  /**
   * Count schedules for a user within a workspace scope
   */
  count(userId: string, workspaceId?: string | null): Promise<number>;
}
