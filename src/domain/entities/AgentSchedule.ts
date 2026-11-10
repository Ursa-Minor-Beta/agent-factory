export type ScheduleTrigger =
  /** Standard 5-field cron (or @daily/@weekly/...), evaluated in the schedule timezone */
  | { type: 'cron'; expression: string; startAt?: Date; endAt?: Date; maxRuns?: number }
  /** Single run at a specific moment */
  | { type: 'once'; at: Date }
  /** Fixed interval counted from anchorAt (anchorAt itself is the first run) */
  | { type: 'interval'; everyMs: number; anchorAt: Date; endAt?: Date; maxRuns?: number };

export type ScheduleTriggerType = ScheduleTrigger['type'];

export const SCHEDULE_TRIGGER_TYPES = ['cron', 'once', 'interval'] as const satisfies readonly ScheduleTriggerType[];

/**
 * session   - all runs go into one persisted chat session (created on first run, recreated if deleted)
 * incognito - no session, no stored messages; only the Run record remains
 */
export type ScheduleSessionMode = 'session' | 'incognito';

/** skip - don't start a run while the previous one from this schedule is still running */
export type ScheduleOverlapPolicy = 'skip' | 'allow';

export type ScheduleLastStatus = 'completed' | 'failed' | 'cancelled' | 'skipped';

export interface AgentSchedule {
  id: string;
  userId: string;
  agentId: string;
  /** Copied from the agent for filtering (null/undefined = global) */
  workspaceId?: string;
  /** Workspace name (populated via lookup) */
  workspaceName?: string;
  name: string;
  description?: string;
  enabled: boolean;
  trigger: ScheduleTrigger;
  /** IANA timezone, e.g. "Europe/Berlin" (used by cron triggers) */
  timezone: string;
  /** Agent input for each run */
  input: Record<string, unknown>;
  sessionMode: ScheduleSessionMode;
  /** Session used by runs in 'session' mode (set on first run, or provided by the user) */
  sessionId?: string;
  overlapPolicy: ScheduleOverlapPolicy;
  /** Disable after this many consecutive failures (0 = never) */
  stopAfterFailures: number;
  nextRunAt?: Date;
  lastRunAt?: Date;
  lastRunId?: string;
  lastStatus?: ScheduleLastStatus;
  lastError?: string;
  runCount: number;
  consecutiveFailures: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAgentScheduleDTO {
  userId: string;
  agentId: string;
  workspaceId?: string;
  name: string;
  description?: string;
  enabled: boolean;
  trigger: ScheduleTrigger;
  timezone: string;
  input: Record<string, unknown>;
  sessionMode: ScheduleSessionMode;
  sessionId?: string;
  overlapPolicy: ScheduleOverlapPolicy;
  stopAfterFailures: number;
  nextRunAt?: Date;
}

export interface UpdateAgentScheduleDTO {
  workspaceId?: string | null;
  name?: string;
  description?: string;
  enabled?: boolean;
  trigger?: ScheduleTrigger;
  timezone?: string;
  input?: Record<string, unknown>;
  sessionMode?: ScheduleSessionMode;
  sessionId?: string | null;
  overlapPolicy?: ScheduleOverlapPolicy;
  stopAfterFailures?: number;
  nextRunAt?: Date | null;
  lastRunAt?: Date;
  lastRunId?: string;
  lastStatus?: ScheduleLastStatus;
  lastError?: string | null;
  runCount?: number;
  consecutiveFailures?: number;
}
