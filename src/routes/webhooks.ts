import { FastifyInstance } from 'fastify';
import { WebhookService, type WebhookRequest } from '../services/webhook.service.js';
import { RunService } from '../services/run.service.js';
import { container } from '../config/container.js';
import { config } from '../config/index.js';
import { requireAuth } from '../middleware/auth.js';
import type { Webhook } from '../domain/entities/Webhook.js';

// Headers never passed to handlers / run input (stored with the run)
const STRIPPED_HEADERS = new Set(['authorization', 'cookie', 'proxy-authorization']);

/** Parse raw body by content type; form "payload" fields holding JSON are decoded */
function parseBody(rawBody: string, contentType: string | undefined): unknown {
  if (!rawBody) return null;
  const type = (contentType ?? '').split(';')[0]!.trim().toLowerCase();
  if (type === 'application/json' || type.endsWith('+json')) {
    try {
      return JSON.parse(rawBody);
    }
    catch {
      return rawBody;
    }
  }
  if (type === 'application/x-www-form-urlencoded') {
    const form: Record<string, unknown> = Object.fromEntries(new URLSearchParams(rawBody));
    if (typeof form.payload === 'string') {
      try {
        form.payload = JSON.parse(form.payload);
      }
      catch {
        // keep as string
      }
    }
    return form;
  }
  return rawBody;
}

function toStringRecord(value: Record<string, unknown>, skip?: Set<string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, v] of Object.entries(value)) {
    if (v === undefined || skip?.has(key)) continue;
    result[key] = Array.isArray(v) ? v.join(', ') : String(v);
  }
  return result;
}

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

const webhookSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    agentId: { type: 'string' },
    agentName: { type: 'string', nullable: true },
    name: { type: 'string' },
    url: { type: 'string' },
    enabled: { type: 'boolean' },
    handler: { type: 'string', nullable: true },
    lastTriggeredAt: { type: 'string', format: 'date-time', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const webhookResponse = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: webhookSchema,
  },
};

const idParams = {
  type: 'object',
  properties: { id: { type: 'string' } },
};

export async function webhookRoutes(app: FastifyInstance) {
  const runService = new RunService(
    container.runRepository,
    container.agentRepository,
    container.runManager,
    container.providerConfigRepository,
    container.userSecretRepository,
    container.userVariableRepository
  );
  const webhookService = new WebhookService(
    container.webhookRepository,
    container.agentRepository,
    runService,
    container.userSecretRepository,
    container.userVariableRepository
  );

  const toResponse = (w: Webhook) => ({
    id: w.id,
    agentId: w.agentId,
    agentName: w.agentName ?? null,
    name: w.name,
    url: webhookService.buildUrl(w),
    enabled: w.enabled,
    handler: w.handler,
    lastTriggeredAt: w.lastTriggeredAt,
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
  });

  // List handler templates
  app.get('/api/webhooks/templates', {
    schema: {
      tags: ['webhooks'],
      summary: 'List webhook handler templates (Slack, GitHub, Telegram)',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  description: { type: 'string' },
                  requiredSecrets: { type: 'array', items: { type: 'string' } },
                  code: { type: 'string' },
                },
              },
            },
          },
        },
        401: errorSchema,
      },
    },
    preHandler: requireAuth,
  }, async (_request, reply) => {
    return reply.send({ success: true, data: webhookService.getTemplates() });
  });

  // List webhooks
  app.get('/api/webhooks', {
    schema: {
      tags: ['webhooks'],
      summary: 'List webhooks (optionally of one agent)',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      querystring: {
        type: 'object',
        properties: {
          agentId: { type: 'string', description: 'Filter by agent' },
          workspaceId: { type: 'string', description: 'Filter by agent workspace ID, "null" for agents not in any workspace' },
          skip: { type: 'integer', minimum: 0, default: 0 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
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
                webhooks: { type: 'array', items: webhookSchema },
                total: { type: 'integer' },
              },
            },
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
    const query = request.query as { agentId?: string; workspaceId?: string; skip?: number; limit?: number };
    const { webhooks, total } = await webhookService.list(userId, {
      ...query,
      // 'null' = agents not assigned to any workspace (same convention as agents/secrets/variables)
      workspaceId: query.workspaceId === 'null' ? null : query.workspaceId,
    });
    return reply.send({ success: true, data: { webhooks: webhooks.map(toResponse), total } });
  });

  // Create webhook
  app.post('/api/webhooks', {
    schema: {
      tags: ['webhooks'],
      summary: 'Create a webhook that triggers an agent',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      body: {
        type: 'object',
        required: ['agentId', 'name'],
        properties: {
          agentId: { type: 'string' },
          name: { type: 'string', minLength: 1, maxLength: 100 },
          handler: { type: 'string', nullable: true, description: 'JS: async function handle(request, ctx) { ... } - see README' },
          template: { type: 'string', description: 'Template id to copy into handler (ignored if handler is set)' },
        },
      },
      response: {
        201: webhookResponse,
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
      },
    },
    preHandler: requireAuth,
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const data = request.body as { agentId: string; name: string; handler?: string | null; template?: string };
    const webhook = await webhookService.create(userId, data);
    return reply.status(201).send({ success: true, data: toResponse(webhook) });
  });

  // Update webhook
  app.patch('/api/webhooks/:id', {
    schema: {
      tags: ['webhooks'],
      summary: 'Update a webhook',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      params: idParams,
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100 },
          enabled: { type: 'boolean' },
          handler: { type: 'string', nullable: true },
        },
      },
      response: {
        200: webhookResponse,
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
    const data = request.body as { name?: string; enabled?: boolean; handler?: string | null };
    const webhook = await webhookService.update(userId, id, data);
    return reply.send({ success: true, data: toResponse(webhook) });
  });

  // Rotate webhook token
  app.post('/api/webhooks/:id/rotate', {
    schema: {
      tags: ['webhooks'],
      summary: 'Generate a new webhook URL token (old URL stops working)',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      params: idParams,
      response: {
        200: webhookResponse,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
      },
    },
    preHandler: requireAuth,
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };
    const webhook = await webhookService.rotateToken(userId, id);
    return reply.send({ success: true, data: toResponse(webhook) });
  });

  // Dry-run the handler
  app.post('/api/webhooks/:id/test', {
    schema: {
      tags: ['webhooks'],
      summary: 'Run the webhook handler against a sample request without starting a run',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      params: idParams,
      body: {
        type: 'object',
        properties: {
          method: { type: 'string' },
          headers: { type: 'object', additionalProperties: { type: 'string' } },
          query: { type: 'object', additionalProperties: { type: 'string' } },
          body: {},
          rawBody: { type: 'string', description: 'Defaults to body (JSON-encoded unless a string)' },
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
                response: { type: 'object', nullable: true, additionalProperties: true },
                runs: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: { input: { type: 'object', additionalProperties: true } },
                  },
                },
                logs: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: { level: { type: 'string' }, message: { type: 'string' } },
                  },
                },
                error: { type: 'string' },
              },
            },
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
    const sample = (request.body ?? {}) as Partial<WebhookRequest>;
    const body = sample.body ?? null;
    const rawBody = sample.rawBody ?? (typeof body === 'string' ? body : body === null ? '' : JSON.stringify(body));
    const headers = Object.fromEntries(
      Object.entries(sample.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v])
    );
    const result = await webhookService.test(userId, id, {
      method: sample.method ?? 'POST',
      headers,
      query: sample.query ?? {},
      body,
      rawBody,
    });
    return reply.send({ success: true, data: result });
  });

  // Delete webhook
  app.delete('/api/webhooks/:id', {
    schema: {
      tags: ['webhooks'],
      summary: 'Delete a webhook',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      params: idParams,
      response: {
        200: {
          type: 'object',
          properties: { success: { type: 'boolean' } },
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
    await webhookService.delete(userId, id);
    return reply.send({ success: true });
  });

  // Public trigger endpoint (token in URL, no auth middleware)
  await app.register(async (hooks) => {
    // Keep the raw body for signature checks; parsed by content type in the handler
    hooks.removeAllContentTypeParsers();
    hooks.addContentTypeParser('*', { parseAs: 'string' }, (_req, body, done) => {
      done(null, body);
    });

    hooks.post('/hooks/:id/:token', {
      bodyLimit: config.webhooks.maxBodyBytes,
      schema: {
        tags: ['webhooks'],
        summary: 'Trigger a webhook (response is defined by its handler; default 202 { runId })',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            token: { type: 'string' },
          },
        },
      },
    }, async (request, reply) => {
      const { id, token } = request.params as { id: string; token: string };
      const rawBody = typeof request.body === 'string' ? request.body : '';
      const result = await webhookService.trigger(id, token, {
        method: request.method,
        headers: toStringRecord(request.headers, STRIPPED_HEADERS),
        query: toStringRecord(request.query as Record<string, unknown>),
        body: parseBody(rawBody, request.headers['content-type']),
        rawBody,
      });
      return reply.status(result.status).headers(result.headers).send(result.body ?? '');
    });
  });
}
