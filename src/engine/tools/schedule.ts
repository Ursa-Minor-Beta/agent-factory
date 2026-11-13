/**
 * Agent schedule management tools (Agent Builder)
 */

import type { BuiltinToolDefinition } from './types.js';
import { PAGING_PARAMETERS, PAGING_HINT } from './paging.js';
import { SCHEDULE_TRIGGER_TYPES } from '../../domain/entities/AgentSchedule.js';
import { MIN_INTERVAL_MS, MIN_CRON_SECONDS_GAP } from '../../domain/services/schedule.service.js';

const TRIGGER_DESC = `Trigger object, "type" is one of ${SCHEDULE_TRIGGER_TYPES.join(', ')}:
- { "type": "cron", "expression": "0 9 * * 1-5", "startAt"?: ISO date, "endAt"?: ISO date, "maxRuns"?: number } - 5-field cron or @daily/@weekly/@monthly/@hourly, evaluated in "timezone". A 6-field expression with leading seconds is allowed if runs are at least ${MIN_CRON_SECONDS_GAP}s apart.
- { "type": "once", "at": ISO date } - single run
- { "type": "interval", "everyMs": number (>= ${MIN_INTERVAL_MS}), "anchorAt": ISO date (first run), "endAt"?: ISO date, "maxRuns"?: number }`;

const SCHEDULE_FIELDS = {
  name: { type: 'string', description: 'Schedule name' },
  description: { type: 'string', description: 'What this schedule is for' },
  enabled: { type: 'boolean', description: 'Whether the schedule is active (default: true)' },
  trigger: { type: 'object', description: TRIGGER_DESC },
  timezone: { type: 'string', description: 'IANA timezone, e.g. "Europe/Berlin" (default: UTC)' },
  input: { type: 'object', description: "Agent input for each run - must match the agent's input node schema" },
  sessionMode: {
    type: 'string',
    description: '"incognito" (default) - no chat history, only run records; "session" - all runs share one chat session (the agent remembers previous runs)',
  },
  overlapPolicy: {
    type: 'string',
    description: '"skip" (default) - don\'t start a run while the previous one is still running; "allow" - run anyway',
  },
  stopAfterFailures: {
    type: 'number',
    description: 'Disable the schedule after this many consecutive failures (0 = never, default)',
  },
};

export const LIST_SCHEDULES_TOOL: BuiltinToolDefinition = {
  type: 'builtin',
  name: 'list_schedules',
  description: `List schedules that run an agent automatically, with their next/last run and status. ${PAGING_HINT}`,
  parameters: {
    type: 'object',
    properties: {
      agentId: { type: 'string', description: 'Only schedules of this agent' },
      name: { type: 'string', description: 'Filter by name (contains, case-insensitive)' },
      ...PAGING_PARAMETERS,
    },
  },
};

export const GET_SCHEDULE_TOOL: BuiltinToolDefinition = {
  type: 'builtin',
  name: 'get_schedule',
  description: 'Get a schedule by id with its full configuration.',
  parameters: {
    type: 'object',
    properties: {
      scheduleId: { type: 'string', description: 'Schedule id' },
    },
    required: ['scheduleId'],
  },
};

export const CREATE_SCHEDULE_TOOL: BuiltinToolDefinition = {
  type: 'builtin',
  name: 'create_schedule',
  description: `Create a schedule that runs a saved agent automatically. Saved immediately.

Example - every weekday at 9:00 Berlin time:
{
  "agentId": "...",
  "name": "Morning digest",
  "trigger": { "type": "cron", "expression": "0 9 * * 1-5" },
  "timezone": "Europe/Berlin",
  "input": { "topic": "AI news" }
}`,
  parameters: {
    type: 'object',
    properties: {
      agentId: { type: 'string', description: 'Agent to run' },
      ...SCHEDULE_FIELDS,
    },
    required: ['agentId', 'name', 'trigger'],
  },
};

export const UPDATE_SCHEDULE_TOOL: BuiltinToolDefinition = {
  type: 'builtin',
  name: 'update_schedule',
  description: 'Update a schedule. Only the provided fields change. Use enabled: false to pause it. Saved immediately.',
  parameters: {
    type: 'object',
    properties: {
      scheduleId: { type: 'string', description: 'Schedule id' },
      ...SCHEDULE_FIELDS,
    },
    required: ['scheduleId'],
  },
};

export const DELETE_SCHEDULE_TOOL: BuiltinToolDefinition = {
  type: 'builtin',
  name: 'delete_schedule',
  description: 'Delete a schedule. This action cannot be undone.',
  parameters: {
    type: 'object',
    properties: {
      scheduleId: { type: 'string', description: 'Schedule id' },
    },
    required: ['scheduleId'],
  },
};

export const SCHEDULE_TOOLS = [
  LIST_SCHEDULES_TOOL,
  GET_SCHEDULE_TOOL,
  CREATE_SCHEDULE_TOOL,
  UPDATE_SCHEDULE_TOOL,
  DELETE_SCHEDULE_TOOL,
];
