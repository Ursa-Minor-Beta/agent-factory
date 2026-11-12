import type { IAgentScheduleRepository, AgentScheduleQueryOptions } from '../domain/interfaces/repositories/IAgentScheduleRepository.js';
import type { IAgentRepository } from '../domain/interfaces/repositories/IAgentRepository.js';
import type { ISessionRepository } from '../domain/interfaces/repositories/ISessionRepository.js';
import type {
  AgentSchedule,
  ScheduleTrigger,
  ScheduleSessionMode,
  ScheduleOverlapPolicy,
  UpdateAgentScheduleDTO,
} from '../domain/entities/AgentSchedule.js';
import { validateScheduleTrigger, computeNextRunAt } from '../domain/services/schedule.service.js';
import { NotFoundError, ForbiddenError, ValidationError } from '../utils/errors.js';

export interface CreateScheduleInput {
  agentId: string;
  name: string;
  description?: string;
  enabled?: boolean;
  trigger: ScheduleTrigger;
  timezone?: string;
  input?: Record<string, unknown>;
  sessionMode?: ScheduleSessionMode;
  /** Existing session to continue (session mode only) */
  sessionId?: string;
  overlapPolicy?: ScheduleOverlapPolicy;
  stopAfterFailures?: number;
}

export interface UpdateScheduleInput {
  name?: string;
  description?: string;
  enabled?: boolean;
  trigger?: ScheduleTrigger;
  timezone?: string;
  input?: Record<string, unknown>;
  sessionMode?: ScheduleSessionMode;
  /** null = start a new session on next run */
  sessionId?: string | null;
  overlapPolicy?: ScheduleOverlapPolicy;
  stopAfterFailures?: number;
}

export class AgentScheduleService {
  constructor(
    private scheduleRepo: IAgentScheduleRepository,
    private agentRepo: IAgentRepository,
    private sessionRepo: ISessionRepository,
    /** Called after any change that may affect timing (wakes the runner) */
    private onChange: () => void = () => {}
  ) {}

  async list(
    userId: string,
    options?: AgentScheduleQueryOptions
  ): Promise<{ schedules: AgentSchedule[]; total: number }> {
    const [schedules, total] = await Promise.all([
      this.scheduleRepo.findByUserId(userId, options),
      this.scheduleRepo.countByUserId(userId, options),
    ]);
    return { schedules, total };
  }

  async getById(userId: string, id: string): Promise<AgentSchedule> {
    const schedule = await this.scheduleRepo.findById(id);
    if (!schedule) {
      throw new NotFoundError('Schedule');
    }
    if (schedule.userId !== userId) {
      throw new ForbiddenError('Access denied');
    }
    return schedule;
  }

  async create(userId: string, data: CreateScheduleInput): Promise<AgentSchedule> {
    const agent = await this.agentRepo.findById(data.agentId);
    if (!agent) {
      throw new NotFoundError('Agent');
    }
    if (agent.userId !== userId) {
      throw new ForbiddenError('Access denied');
    }

    const timezone = data.timezone ?? 'UTC';
    const sessionMode = data.sessionMode ?? 'incognito';
    const enabled = data.enabled ?? true;
    const trigger = normalizeTrigger(data.trigger);

    this.assertValidTrigger(trigger, timezone);
    this.assertValidStopAfterFailures(data.stopAfterFailures);
    if (data.sessionId) {
      await this.assertSessionUsable(userId, agent.id, sessionMode, data.sessionId);
    }

    const nextRunAt = this.computeInitialNextRunAt(trigger, timezone, 0);

    const schedule = await this.scheduleRepo.create({
      userId,
      agentId: agent.id,
      workspaceId: agent.workspaceId,
      name: data.name,
      description: data.description,
      enabled,
      trigger,
      timezone,
      input: data.input ?? {},
      sessionMode,
      sessionId: data.sessionId,
      overlapPolicy: data.overlapPolicy ?? 'skip',
      stopAfterFailures: data.stopAfterFailures ?? 0,
      nextRunAt,
    });

    this.onChange();
    return schedule;
  }

  async update(userId: string, id: string, data: UpdateScheduleInput): Promise<AgentSchedule> {
    const schedule = await this.getById(userId, id);

    const trigger = data.trigger ? normalizeTrigger(data.trigger) : schedule.trigger;
    const timezone = data.timezone ?? schedule.timezone;
    const sessionMode = data.sessionMode ?? schedule.sessionMode;
    const enabled = data.enabled ?? schedule.enabled;

    const timingChanged = data.trigger !== undefined || data.timezone !== undefined;
    const reEnabled = enabled && !schedule.enabled;

    this.assertValidTrigger(trigger, timezone);
    this.assertValidStopAfterFailures(data.stopAfterFailures);
    if (data.sessionId) {
      await this.assertSessionUsable(userId, schedule.agentId, sessionMode, data.sessionId);
    }

    const updates: UpdateAgentScheduleDTO = {
      name: data.name,
      description: data.description,
      enabled,
      trigger: data.trigger ? trigger : undefined,
      timezone: data.timezone,
      input: data.input,
      sessionMode: data.sessionMode,
      sessionId: data.sessionId,
      overlapPolicy: data.overlapPolicy,
      stopAfterFailures: data.stopAfterFailures,
    };

    // Incognito schedules never keep a session
    if (sessionMode === 'incognito') {
      updates.sessionId = null;
    }

    // A new trigger starts counting from scratch
    if (data.trigger) {
      updates.runCount = 0;
    }
    if (reEnabled) {
      updates.consecutiveFailures = 0;
    }
    if (timingChanged || reEnabled) {
      const runCount = updates.runCount ?? schedule.runCount;
      updates.nextRunAt = enabled
        ? this.computeInitialNextRunAt(trigger, timezone, runCount)
        : computeNextRunAt(trigger, timezone, new Date(), runCount);
    }

    const updated = await this.scheduleRepo.update(id, updates);
    if (!updated) {
      throw new NotFoundError('Schedule');
    }

    this.onChange();
    return updated;
  }

  async delete(userId: string, id: string): Promise<void> {
    await this.getById(userId, id);
    await this.scheduleRepo.delete({ id });
    this.onChange();
  }

  private assertValidTrigger(trigger: ScheduleTrigger, timezone: string): void {
    const error = validateScheduleTrigger(trigger, timezone);
    if (error) {
      throw new ValidationError(error);
    }
  }

  private assertValidStopAfterFailures(value: number | undefined): void {
    if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
      throw new ValidationError('"stopAfterFailures" must be a non-negative integer');
    }
  }

  /** Next run for an active schedule; rejects schedules that would never fire */
  private computeInitialNextRunAt(trigger: ScheduleTrigger, timezone: string, runCount: number): Date {
    const now = new Date();
    if (trigger.type === 'once' && runCount === 0 && trigger.at <= now) {
      throw new ValidationError('"at" must be in the future');
    }
    const next = computeNextRunAt(trigger, timezone, now, runCount);
    if (!next) {
      throw new ValidationError('Schedule has no upcoming runs');
    }
    return next;
  }

  private async assertSessionUsable(
    userId: string,
    agentId: string,
    sessionMode: ScheduleSessionMode,
    sessionId: string
  ): Promise<void> {
    if (sessionMode !== 'session') {
      throw new ValidationError('"sessionId" requires sessionMode "session"');
    }
    const session = await this.sessionRepo.findById(sessionId);
    if (!session) {
      throw new NotFoundError('Session');
    }
    if (session.userId !== userId) {
      throw new ForbiddenError('Access denied');
    }
    if (session.agentId !== agentId) {
      throw new ValidationError('Session belongs to a different agent');
    }
  }
}

/** Convert ISO strings from JSON bodies to Dates and keep only fields relevant to the trigger type */
export function normalizeTrigger(raw: ScheduleTrigger): ScheduleTrigger {
  const toDate = (value: unknown): Date | undefined =>
    value === undefined || value === null ? undefined : new Date(value as string | Date);

  switch (raw.type) {
  case 'once':
    return { type: 'once', at: toDate(raw.at)! };
  case 'cron':
    return {
      type: 'cron',
      expression: raw.expression,
      startAt: toDate(raw.startAt),
      endAt: toDate(raw.endAt),
      maxRuns: raw.maxRuns,
    };
  case 'interval':
    return {
      type: 'interval',
      everyMs: raw.everyMs,
      anchorAt: toDate(raw.anchorAt) ?? new Date(),
      endAt: toDate(raw.endAt),
      maxRuns: raw.maxRuns,
    };
  }
}
