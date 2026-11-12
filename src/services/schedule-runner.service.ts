import type { IAgentScheduleRepository } from '../domain/interfaces/repositories/IAgentScheduleRepository.js';
import type { IAgentRepository } from '../domain/interfaces/repositories/IAgentRepository.js';
import type { ISessionRepository } from '../domain/interfaces/repositories/ISessionRepository.js';
import type { AgentSchedule, UpdateAgentScheduleDTO } from '../domain/entities/AgentSchedule.js';
import type { SessionService } from './session.service.js';
import { computeNextRunAt } from '../domain/services/schedule.service.js';
import { AgentExecutionError } from '../utils/errors.js';

export interface ScheduleRunnerOptions {
  pollIntervalMs: number;
  maxConcurrentRuns: number;
}

/**
 * Executes agent schedules in-process.
 *
 * A single timer sleeps until the earliest nextRunAt (capped by pollIntervalMs), then fires due
 * schedules. nextRunAt is advanced *before* a run starts, so a long run never re-fires the same slot.
 * Missed slots (e.g. after downtime) collapse into one run, then the schedule skips ahead.
 *
 * Assumes a single backend instance (run tracking is in memory).
 */
export class ScheduleRunner {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private ticking = false;
  /** scheduleId -> number of in-flight runs */
  private active = new Map<string, number>();
  private activeTotal = 0;

  constructor(
    private scheduleRepo: IAgentScheduleRepository,
    private agentRepo: IAgentRepository,
    private sessionRepo: ISessionRepository,
    private sessionService: SessionService,
    private options: ScheduleRunnerOptions
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.schedule(0);
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /** Re-check timing now (call after schedules are created/updated) */
  wake(): void {
    if (this.running) {
      this.schedule(0);
    }
  }

  isActive(scheduleId: string): boolean {
    return (this.active.get(scheduleId) ?? 0) > 0;
  }

  /**
   * Run a schedule immediately, outside its timing (doesn't change nextRunAt or runCount).
   * Returns when the run has been started.
   */
  async runNow(schedule: AgentSchedule): Promise<void> {
    if (schedule.overlapPolicy === 'skip' && this.isActive(schedule.id)) {
      throw new Error('Schedule is already running');
    }
    void this.execute(schedule, new Date());
  }

  private schedule(delayMs: number): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => void this.tick(), Math.max(0, delayMs));
  }

  private async tick(): Promise<void> {
    if (!this.running) return;
    if (this.ticking) {
      // A tick is in progress - check again shortly
      this.schedule(1000);
      return;
    }
    this.ticking = true;

    try {
      const capacity = this.options.maxConcurrentRuns - this.activeTotal;
      if (capacity > 0) {
        const now = new Date();
        const due = await this.scheduleRepo.findDue(now, capacity);
        for (const schedule of due) {
          await this.fire(schedule, now);
        }
      }
    }
    catch (error) {
      console.error('[Scheduler] Tick failed:', error instanceof Error ? error.message : error);
    }
    finally {
      this.ticking = false;
    }

    if (!this.running) return;
    this.schedule(await this.nextDelay());
  }

  private async nextDelay(): Promise<number> {
    // At capacity - wait for a run to finish (finishing runs wake the loop)
    if (this.activeTotal >= this.options.maxConcurrentRuns) {
      return this.options.pollIntervalMs;
    }
    try {
      const next = await this.scheduleRepo.findNextRunAt();
      if (!next) return this.options.pollIntervalMs;
      return Math.min(this.options.pollIntervalMs, next.getTime() - Date.now());
    }
    catch {
      return this.options.pollIntervalMs;
    }
  }

  /** Advance a due schedule's timing, then start its run (unless skipped) */
  private async fire(schedule: AgentSchedule, now: Date): Promise<void> {
    const scheduledFor = schedule.nextRunAt ?? now;
    const runCount = schedule.runCount + 1;
    // Compute from "now" so missed slots are not replayed
    const after = scheduledFor > now ? scheduledFor : now;
    const nextRunAt = computeNextRunAt(schedule.trigger, schedule.timezone, after, runCount);

    const timing: UpdateAgentScheduleDTO = {
      runCount,
      nextRunAt,
      // Exhausted schedules (once / endAt / maxRuns) switch off
      enabled: nextRunAt !== null,
    };

    // Previous run still in flight - consume the slot (counts towards maxRuns) without running
    if (schedule.overlapPolicy === 'skip' && this.isActive(schedule.id)) {
      await this.scheduleRepo.update(schedule.id, { ...timing, lastStatus: 'skipped' });
      return;
    }

    await this.scheduleRepo.update(schedule.id, timing);
    void this.execute(schedule, scheduledFor);
  }

  private async execute(schedule: AgentSchedule, scheduledFor: Date): Promise<void> {
    this.active.set(schedule.id, (this.active.get(schedule.id) ?? 0) + 1);
    this.activeTotal++;

    const startedAt = new Date();
    const result: UpdateAgentScheduleDTO = { lastRunAt: startedAt };
    let failed = false;

    try {
      const agent = await this.agentRepo.findById(schedule.agentId);
      if (!agent || agent.userId !== schedule.userId) {
        await this.scheduleRepo.update(schedule.id, {
          enabled: false,
          nextRunAt: null,
          lastRunAt: startedAt,
          lastStatus: 'failed',
          lastError: 'Agent not found or no longer accessible - schedule disabled',
        });
        return;
      }
      // Keep workspace filter in sync if the agent was moved
      if (agent.workspaceId !== schedule.workspaceId) {
        result.workspaceId = agent.workspaceId ?? null;
      }

      const sessionId = schedule.sessionMode === 'session'
        ? await this.resolveSessionId(schedule)
        : undefined;

      const chat = await this.sessionService.chat(schedule.userId, schedule.agentId, schedule.input, {
        sessionId,
        incognito: schedule.sessionMode === 'incognito',
        ephemeral: true,
        // Only used when a new session is created
        title: schedule.name,
        triggeredBy: { triggerType: 'schedule', scheduleId: schedule.id, scheduledFor },
      });

      result.lastRunId = chat.runId;
      result.lastStatus = chat.cancelled ? 'cancelled' : 'completed';
      result.lastError = null;
      result.consecutiveFailures = 0;

      // Remember new session (first run, or previous one was deleted)
      if (schedule.sessionMode === 'session' && chat.sessionId && chat.sessionId !== schedule.sessionId) {
        result.sessionId = chat.sessionId;
      }
    }
    catch (error) {
      failed = true;
      result.lastStatus = 'failed';
      result.lastError = error instanceof Error ? error.message : String(error);
      if (error instanceof AgentExecutionError) {
        result.lastRunId = error.runId;
      }
    }
    finally {
      this.active.set(schedule.id, (this.active.get(schedule.id) ?? 1) - 1);
      if (this.active.get(schedule.id) === 0) {
        this.active.delete(schedule.id);
      }
      this.activeTotal--;
    }

    // Shutting down - the run was cancelled by RunManager.shutdown(), don't record it as a failure
    if (!this.running) return;

    try {
      if (failed) {
        // Re-read: counter may have changed while the run was in flight
        const current = await this.scheduleRepo.findById(schedule.id);
        if (!current) return;
        const consecutiveFailures = current.consecutiveFailures + 1;
        result.consecutiveFailures = consecutiveFailures;
        if (current.stopAfterFailures > 0 && consecutiveFailures >= current.stopAfterFailures) {
          result.enabled = false;
          result.lastError = `${result.lastError} (disabled after ${consecutiveFailures} consecutive failures)`;
        }
      }
      await this.scheduleRepo.update(schedule.id, result);
    }
    catch (error) {
      console.error(`[Scheduler] Failed to record result for schedule ${schedule.id}:`, error instanceof Error ? error.message : error);
    }

    this.wake();
  }

  /** Stored session if it still exists and fits this schedule; otherwise undefined (chat() creates a new one) */
  private async resolveSessionId(schedule: AgentSchedule): Promise<string | undefined> {
    if (!schedule.sessionId) return undefined;
    const session = await this.sessionRepo.findById(schedule.sessionId);
    if (!session || session.userId !== schedule.userId || session.agentId !== schedule.agentId) {
      return undefined;
    }
    return session.id;
  }
}
