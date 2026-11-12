import { FastifyInstance } from 'fastify';
import { AgentScheduleService, normalizeTrigger } from '../services/agent-schedule.service.js';
import type { CreateScheduleInput, UpdateScheduleInput } from '../services/agent-schedule.service.js';
import { container } from '../config/container.js';
import { requireAuth } from '../middleware/auth.js';
import type { AgentSchedule, ScheduleTrigger } from '../domain/entities/AgentSchedule.js';
import { SCHEDULE_TRIGGER_TYPES } from '../domain/entities/AgentSchedule.js';
import type { AgentScheduleQueryOptions } from '../domain/interfaces/repositories/IAgentScheduleRepository.js';
import { validateScheduleTrigger, computeNextRunAt } from '../domain/services/schedule.service.js';
import { ValidationError, ConflictError } from '../utils/errors.js';

// Schemas
const errorSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    error: {
      type: 'object',
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
      },
    },
  },
};

const triggerSchema = {
  type: 'object',
  required: ['type'],
  description: 'cron: { expression, startAt?, endAt?, maxRuns? } | once: { at } | interval: { everyMs, anchorAt?, endAt?, maxRuns? }',
  properties: {
    type: { type: 'string', enum: [...SCHEDULE_TRIGGER_TYPES] },
    expression: { type: 'string', description: 'cron: 5-field expression, 6-field with leading seconds (>= 10s apart), or @daily/@weekly/@monthly/@yearly/@hourly' },
    startAt: { type: 'string', format: 'date-time', description: 'cron: do not fire before' },
    at: { type: 'string', format: 'date-time', description: 'once: run time' },
    everyMs: { type: 'integer', minimum: 60000, description: 'interval: period in milliseconds' },
    anchorAt: { type: 'string', format: 'date-time', description: 'interval: first run (default: now)' },
    endAt: { type: 'string', format: 'date-time', description: 'cron/interval: do not fire after' },
    maxRuns: { type: 'integer', minimum: 1, description: 'cron/interval: stop after N runs' },
  },
};

const scheduleSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    agentId: { type: 'string' },
    workspaceId: { type: 'string', nullable: true },
    workspaceName: { type: 'string', nullable: true },
    name: { type: 'string' },
    description: { type: 'string' },
    enabled: { type: 'boolean' },
    trigger: triggerSchema,
    timezone: { type: 'string' },
    input: { type: 'object', additionalProperties: true },
    sessionMode: { type: 'string', enum: ['session', 'incognito'] },
    sessionId: { type: 'string', nullable: true },
    overlapPolicy: { type: 'string', enum: ['skip', 'allow'] },
    stopAfterFailures: { type: 'integer' },
    nextRunAt: { type: 'string', format: 'date-time', nullable: true },
    lastRunAt: { type: 'string', format: 'date-time', nullable: true },
    lastRunId: { type: 'string', nullable: true },
    lastStatus: { type: 'string', nullable: true },
    lastError: { type: 'string', nullable: true },
    runCount: { type: 'integer' },
    consecutiveFailures: { type: 'integer' },
    running: { type: 'boolean', description: 'A run from this schedule is in progress' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const writableProperties = {
  name: { type: 'string', minLength: 1 },
  description: { type: 'string' },
  enabled: { type: 'boolean' },
  trigger: triggerSchema,
  timezone: { type: 'string', description: 'IANA timezone (default: UTC)' },
  input: { type: 'object', additionalProperties: true, description: 'Agent input for each run' },
  sessionMode: {
    type: 'string',
    enum: ['session', 'incognito'],
    description: 'session: all runs continue one chat session; incognito: no session, nothing stored besides the run',
  },
  overlapPolicy: { type: 'string', enum: ['skip', 'allow'], description: 'skip: do not start while previous run is in progress' },
  stopAfterFailures: { type: 'integer', minimum: 0, description: 'Disable after N consecutive failures (0 = never)' },
};

const idParams = {
  type: 'object',
  properties: { id: { type: 'string' } },
};

const MAX_PREVIEW = 20;

const toDate = (value?: string): Date | undefined => (value ? new Date(value) : undefined);

export async function scheduleRoutes(app: FastifyInstance) {
  const runner = container.scheduleRunner;
  const scheduleService = new AgentScheduleService(
    container.agentScheduleRepository,
    container.agentRepository,
    container.sessionRepository,
    () => runner.wake()
  );

  const toResponse = (s: AgentSchedule) => ({
    ...s,
    workspaceId: s.workspaceId ?? null,
    workspaceName: s.workspaceName ?? null,
    sessionId: s.sessionId ?? null,
    running: runner.isActive(s.id),
  });

  // List schedules
  app.get('/api/schedules', {
    schema: {
      tags: ['schedules'],
      summary: 'List agent schedules',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      querystring: {
        type: 'object',
        properties: {
          agentId: { type: 'string' },
          workspaceId: {
            type: 'string',
            description: 'Filter by workspace ID. Omit for all, "null" for global only, or ID for workspace only.',
          },
          enabled: { type: 'boolean' },
          name: { type: 'string', description: 'Filter by name (contains, case-insensitive)' },
          description: { type: 'string', description: 'Filter by description (contains, case-insensitive)' },
          triggerType: { type: 'string', enum: SCHEDULE_TRIGGER_TYPES },
          lastStatus: { type: 'string', enum: ['completed', 'failed', 'cancelled', 'skipped'] },
          sessionMode: { type: 'string', enum: ['session', 'incognito'] },
          nextRunAfter: { type: 'string', format: 'date-time', description: 'Filter by next run time (after)' },
          nextRunBefore: { type: 'string', format: 'date-time', description: 'Filter by next run time (before)' },
          createdAfter: { type: 'string', format: 'date-time', description: 'Filter by created date (after)' },
          createdBefore: { type: 'string', format: 'date-time', description: 'Filter by created date (before)' },
          updatedAfter: { type: 'string', format: 'date-time', description: 'Filter by updated date (after)' },
          updatedBefore: { type: 'string', format: 'date-time', description: 'Filter by updated date (before)' },
          sortBy: { type: 'string', enum: ['name', 'nextRunAt', 'lastRunAt', 'runCount', 'createdAt', 'updatedAt'], default: 'updatedAt' },
          sortOrder: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
          skip: { type: 'integer', minimum: 0, default: 0 },
          limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Omit to return all' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'array', items: scheduleSchema },
            total: { type: 'integer', description: 'Total matching schedules (ignores skip/limit)' },
          },
        },
        401: errorSchema,
      },
    },
    preHandler: requireAuth,
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const query = request.query as {
      agentId?: string;
      workspaceId?: string;
      enabled?: boolean;
      name?: string;
      description?: string;
      triggerType?: AgentScheduleQueryOptions['triggerType'];
      lastStatus?: AgentScheduleQueryOptions['lastStatus'];
      sessionMode?: AgentScheduleQueryOptions['sessionMode'];
      nextRunAfter?: string;
      nextRunBefore?: string;
      createdAfter?: string;
      createdBefore?: string;
      updatedAfter?: string;
      updatedBefore?: string;
      sortBy?: AgentScheduleQueryOptions['sortBy'];
      sortOrder?: 'asc' | 'desc';
      skip?: number;
      limit?: number;
    };

    const options: AgentScheduleQueryOptions = {
      skip: query.skip,
      limit: query.limit,
      agentId: query.agentId,
      enabled: query.enabled,
      name: query.name,
      description: query.description,
      triggerType: query.triggerType,
      lastStatus: query.lastStatus,
      sessionMode: query.sessionMode,
      nextRunAfter: toDate(query.nextRunAfter),
      nextRunBefore: toDate(query.nextRunBefore),
      createdAfter: toDate(query.createdAfter),
      createdBefore: toDate(query.createdBefore),
      updatedAfter: toDate(query.updatedAfter),
      updatedBefore: toDate(query.updatedBefore),
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    };
    if (query.workspaceId === 'null') {
      options.workspaceId = null;
    }
    else if (query.workspaceId) {
      options.workspaceId = query.workspaceId;
    }

    const { schedules, total } = await scheduleService.list(userId, options);
    return reply.send({ success: true, data: schedules.map(toResponse), total });
  });

  // Preview upcoming run times (no save)
  app.post('/api/schedules/preview', {
    schema: {
      tags: ['schedules'],
      summary: 'Preview upcoming run times for a trigger',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      body: {
        type: 'object',
        required: ['trigger'],
        properties: {
          trigger: triggerSchema,
          timezone: { type: 'string' },
          count: { type: 'integer', minimum: 1, maximum: MAX_PREVIEW, default: 5 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                nextRuns: { type: 'array', items: { type: 'string', format: 'date-time' } },
              },
            },
          },
        },
        400: errorSchema,
        401: errorSchema,
      },
    },
    preHandler: requireAuth,
  }, async (request, reply) => {
    const body = request.body as { trigger: ScheduleTrigger; timezone?: string; count?: number };
    const timezone = body.timezone ?? 'UTC';
    const trigger = normalizeTrigger(body.trigger);

    const error = validateScheduleTrigger(trigger, timezone);
    if (error) {
      throw new ValidationError(error);
    }

    const nextRuns: Date[] = [];
    let after = new Date();
    for (let i = 0; i < (body.count ?? 5); i++) {
      const next = computeNextRunAt(trigger, timezone, after, i);
      if (!next) break;
      nextRuns.push(next);
      after = next;
    }

    return reply.send({ success: true, data: { nextRuns } });
  });

  // Get schedule
  app.get('/api/schedules/:id', {
    schema: {
      tags: ['schedules'],
      summary: 'Get a schedule',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      params: idParams,
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: scheduleSchema,
          },
        },
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
      },
    },
    preHandler: requireAuth,
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };

    const schedule = await scheduleService.getById(userId, id);
    return reply.send({ success: true, data: toResponse(schedule) });
  });

  // Create schedule
  app.post('/api/schedules', {
    schema: {
      tags: ['schedules'],
      summary: 'Create a schedule',
      description: 'Run an agent on a schedule. Scheduled runs appear in /api/executions with triggeredBy.triggerType = "schedule".',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      body: {
        type: 'object',
        required: ['agentId', 'name', 'trigger'],
        properties: {
          agentId: { type: 'string' },
          ...writableProperties,
          sessionId: { type: 'string', description: 'Continue an existing session of this agent (sessionMode "session")' },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: scheduleSchema,
          },
        },
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
      },
    },
    preHandler: requireAuth,
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const body = request.body as CreateScheduleInput;

    const schedule = await scheduleService.create(userId, body);
    return reply.status(201).send({ success: true, data: toResponse(schedule) });
  });

  // Update schedule
  app.patch('/api/schedules/:id', {
    schema: {
      tags: ['schedules'],
      summary: 'Update a schedule',
      description: 'Changing trigger resets runCount. Re-enabling resets consecutiveFailures.',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      params: idParams,
      body: {
        type: 'object',
        properties: {
          ...writableProperties,
          sessionId: {
            type: 'string',
            nullable: true,
            description: 'Existing session to continue, or null to start a new session on the next run',
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: scheduleSchema,
          },
        },
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
      },
    },
    preHandler: requireAuth,
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };
    const body = request.body as UpdateScheduleInput;

    const schedule = await scheduleService.update(userId, id, body);
    return reply.send({ success: true, data: toResponse(schedule) });
  });

  // Delete schedule
  app.delete('/api/schedules/:id', {
    schema: {
      tags: ['schedules'],
      summary: 'Delete a schedule',
      description: 'Runs already started are not cancelled. Past runs are kept.',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      params: idParams,
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
          },
        },
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
      },
    },
    preHandler: requireAuth,
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };

    await scheduleService.delete(userId, id);
    return reply.send({ success: true, message: 'Schedule deleted' });
  });

  // Run now
  app.post('/api/schedules/:id/run', {
    schema: {
      tags: ['schedules'],
      summary: 'Run a schedule now',
      description: 'Starts a run immediately without changing nextRunAt or runCount. Follow progress via /api/executions?scheduleId=<id>.',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      params: idParams,
      response: {
        202: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
          },
        },
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        409: errorSchema,
      },
    },
    preHandler: requireAuth,
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };

    const schedule = await scheduleService.getById(userId, id);
    if (schedule.overlapPolicy === 'skip' && runner.isActive(schedule.id)) {
      throw new ConflictError('Schedule is already running');
    }
    await runner.runNow(schedule);

    return reply.status(202).send({ success: true, message: 'Run started' });
  });
}
