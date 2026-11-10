import type { ScheduleTrigger } from '../entities/AgentSchedule.js';
import { parseCron, nextCronTime, isValidTimezone, minSecondsGap } from '../../utils/cron.js';

/** Smallest allowed interval between runs */
export const MIN_INTERVAL_MS = 60 * 1000;

/** Smallest allowed gap between cron runs when a seconds field is used */
export const MIN_CRON_SECONDS_GAP = 10;

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !isNaN(value.getTime());
}

/**
 * Validate a trigger + timezone. Returns an error message, or null when valid.
 */
export function validateScheduleTrigger(trigger: ScheduleTrigger, timezone: string): string | null {
  if (!isValidTimezone(timezone)) {
    return `Invalid timezone "${timezone}"`;
  }

  switch (trigger.type) {
  case 'once':
    if (!isValidDate(trigger.at)) return '"at" must be a valid date';
    return null;

  case 'cron':
    if (typeof trigger.expression !== 'string' || trigger.expression.trim() === '') {
      return '"expression" is required';
    }
    if ((trigger.startAt && !isValidDate(trigger.startAt)) || (trigger.endAt && !isValidDate(trigger.endAt))) {
      return '"startAt" / "endAt" must be valid dates';
    }
    try {
      if (minSecondsGap(parseCron(trigger.expression)) < MIN_CRON_SECONDS_GAP) {
        return `Cron seconds must be at least ${MIN_CRON_SECONDS_GAP}s apart`;
      }
    }
    catch (error) {
      return error instanceof Error ? error.message : 'Invalid cron expression';
    }
    if (trigger.startAt && trigger.endAt && trigger.startAt >= trigger.endAt) {
      return '"startAt" must be before "endAt"';
    }
    if (trigger.maxRuns !== undefined && (!Number.isInteger(trigger.maxRuns) || trigger.maxRuns < 1)) {
      return '"maxRuns" must be a positive integer';
    }
    return null;

  case 'interval':
    if (!Number.isInteger(trigger.everyMs) || trigger.everyMs < MIN_INTERVAL_MS) {
      return `"everyMs" must be an integer >= ${MIN_INTERVAL_MS}`;
    }
    if (!isValidDate(trigger.anchorAt)) return '"anchorAt" must be a valid date';
    if (trigger.endAt && !isValidDate(trigger.endAt)) return '"endAt" must be a valid date';
    if (trigger.endAt && trigger.anchorAt >= trigger.endAt) {
      return '"anchorAt" must be before "endAt"';
    }
    if (trigger.maxRuns !== undefined && (!Number.isInteger(trigger.maxRuns) || trigger.maxRuns < 1)) {
      return '"maxRuns" must be a positive integer';
    }
    return null;
  }
}

/**
 * Compute the next run time strictly after `after`.
 * Returns null when the schedule is exhausted (once already ran, past endAt, maxRuns reached, no cron match).
 *
 * Missed runs are not replayed: pass `after = now` to skip ahead to the next future slot.
 */
export function computeNextRunAt(
  trigger: ScheduleTrigger,
  timezone: string,
  after: Date,
  runCount: number
): Date | null {
  let next: Date | null;

  switch (trigger.type) {
  case 'once':
    return runCount === 0 ? trigger.at : null;

  case 'cron': {
    if (trigger.maxRuns !== undefined && runCount >= trigger.maxRuns) return null;
    // Start searching just before startAt so startAt itself can match
    const from = trigger.startAt && trigger.startAt.getTime() > after.getTime()
      ? new Date(trigger.startAt.getTime() - 1)
      : after;
    next = nextCronTime(parseCron(trigger.expression), from, timezone);
    if (next && trigger.endAt && next > trigger.endAt) return null;
    return next;
  }

  case 'interval': {
    if (trigger.maxRuns !== undefined && runCount >= trigger.maxRuns) return null;
    const anchor = trigger.anchorAt.getTime();
    const elapsed = after.getTime() - anchor;
    next = elapsed < 0
      ? trigger.anchorAt
      : new Date(anchor + (Math.floor(elapsed / trigger.everyMs) + 1) * trigger.everyMs);
    if (trigger.endAt && next > trigger.endAt) return null;
    return next;
  }
  }
}
