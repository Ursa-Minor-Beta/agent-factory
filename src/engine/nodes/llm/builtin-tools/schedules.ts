/**
 * Agent schedule builtin tool handlers
 */

import type { AgentSchedule } from '../../../../domain/entities/AgentSchedule.js';
import type { CreateScheduleInput, UpdateScheduleInput } from '../../../../services/agent-schedule.service.js';
import type { ExecutionOptions } from '../../base.js';
import type { ToolHandler } from './types.js';
import { parsePaging } from './paging.js';

const SCHEDULE_FIELDS = [
  'name',
  'description',
  'enabled',
  'trigger',
  'timezone',
  'input',
  'sessionMode',
  'overlapPolicy',
  'stopAfterFailures',
] as const;

function requireService(toolName: string, options: ExecutionOptions) {
  if (!options.scheduleService) {
    throw new Error(`${toolName} tool requires scheduleService in options`);
  }
  if (!options.userId) {
    throw new Error(`${toolName} tool requires userId in options`);
  }
  return { scheduleService: options.scheduleService, userId: options.userId };
}

function pickFields(args: Record<string, unknown>): UpdateScheduleInput {
  const data: Record<string, unknown> = {};
  for (const key of SCHEDULE_FIELDS) {
    if (args[key] !== undefined) {
      data[key] = args[key];
    }
  }
  return data as UpdateScheduleInput;
}

function toResult(schedule: AgentSchedule) {
  return {
    id: schedule.id,
    agentId: schedule.agentId,
    name: schedule.name,
    description: schedule.description,
    enabled: schedule.enabled,
    trigger: schedule.trigger,
    timezone: schedule.timezone,
    input: schedule.input,
    sessionMode: schedule.sessionMode,
    overlapPolicy: schedule.overlapPolicy,
    stopAfterFailures: schedule.stopAfterFailures,
    nextRunAt: schedule.nextRunAt ?? null,
    lastRunAt: schedule.lastRunAt ?? null,
    lastStatus: schedule.lastStatus ?? null,
    lastError: schedule.lastError ?? null,
    runCount: schedule.runCount,
  };
}

function toError(error: unknown, fallback: string) {
  return { success: false, error: error instanceof Error ? error.message : fallback };
}

/**
 * Handle list_schedules tool
 */
export const handleListSchedules: ToolHandler = async (args, options) => {
  const { scheduleService, userId } = requireService('list_schedules', options);
  try {
    const agentId = args.agentId ? String(args.agentId) : undefined;
    const { skip, limit } = parsePaging(args);
    const { schedules, total } = await scheduleService.list(userId, {
      agentId,
      name: args.name ? String(args.name) : undefined,
      skip,
      limit,
    });
    return { success: true, total, hasMore: skip + schedules.length < total, schedules: schedules.map(toResult) };
  }
  catch (error) {
    return toError(error, 'Failed to list schedules');
  }
};

/**
 * Handle get_schedule tool
 */
export const handleGetSchedule: ToolHandler = async (args, options) => {
  const { scheduleService, userId } = requireService('get_schedule', options);
  try {
    const schedule = await scheduleService.getById(userId, String(args.scheduleId ?? ''));
    return { success: true, schedule: toResult(schedule) };
  }
  catch (error) {
    return toError(error, 'Failed to get schedule');
  }
};

/**
 * Handle create_schedule tool
 */
export const handleCreateSchedule: ToolHandler = async (args, options) => {
  const { scheduleService, userId } = requireService('create_schedule', options);
  try {
    const schedule = await scheduleService.create(userId, {
      ...pickFields(args),
      agentId: String(args.agentId ?? ''),
    } as CreateScheduleInput);
    return {
      success: true,
      schedule: toResult(schedule),
      message: `Schedule "${schedule.name}" created`,
    };
  }
  catch (error) {
    return toError(error, 'Failed to create schedule');
  }
};

/**
 * Handle update_schedule tool
 */
export const handleUpdateSchedule: ToolHandler = async (args, options) => {
  const { scheduleService, userId } = requireService('update_schedule', options);
  try {
    const schedule = await scheduleService.update(userId, String(args.scheduleId ?? ''), pickFields(args));
    return {
      success: true,
      schedule: toResult(schedule),
      message: `Schedule "${schedule.name}" updated`,
    };
  }
  catch (error) {
    return toError(error, 'Failed to update schedule');
  }
};

/**
 * Handle delete_schedule tool
 */
export const handleDeleteSchedule: ToolHandler = async (args, options) => {
  const { scheduleService, userId } = requireService('delete_schedule', options);
  try {
    await scheduleService.delete(userId, String(args.scheduleId ?? ''));
    return { success: true, message: 'Schedule deleted' };
  }
  catch (error) {
    return toError(error, 'Failed to delete schedule');
  }
};
