/**
 * Webhook builtin tool handlers
 */

import type { Webhook } from '../../../../domain/entities/Webhook.js';
import type { WebhookService } from '../../../../services/webhook.service.js';
import type { ExecutionOptions } from '../../base.js';
import type { ToolHandler } from './types.js';
import { parsePaging } from './paging.js';

function requireService(toolName: string, options: ExecutionOptions) {
  if (!options.webhookService) {
    throw new Error(`${toolName} tool requires webhookService in options`);
  }
  if (!options.userId) {
    throw new Error(`${toolName} tool requires userId in options`);
  }
  return { webhookService: options.webhookService, userId: options.userId };
}

function toResult(webhookService: WebhookService, webhook: Webhook) {
  return {
    id: webhook.id,
    agentId: webhook.agentId,
    name: webhook.name,
    url: webhookService.buildUrl(webhook),
    enabled: webhook.enabled,
    handler: webhook.handler,
    lastTriggeredAt: webhook.lastTriggeredAt,
  };
}

function toError(error: unknown, fallback: string) {
  return { success: false, error: error instanceof Error ? error.message : fallback };
}

/** undefined = unchanged, string = new source ("" clears it, handled by the service) */
function optionalString(value: unknown): string | undefined {
  return value === undefined || value === null ? undefined : String(value);
}

/**
 * Handle list_webhook_templates tool
 */
export const handleListWebhookTemplates: ToolHandler = async (_args, options) => {
  const { webhookService } = requireService('list_webhook_templates', options);
  return { success: true, templates: webhookService.getTemplates() };
};

/**
 * Handle list_webhooks tool
 */
export const handleListWebhooks: ToolHandler = async (args, options) => {
  const { webhookService, userId } = requireService('list_webhooks', options);
  try {
    const agentId = args.agentId ? String(args.agentId) : undefined;
    const { skip, limit } = parsePaging(args);
    const { webhooks, total } = await webhookService.list(userId, {
      agentId,
      name: args.name ? String(args.name) : undefined,
      skip,
      limit,
    });
    return {
      success: true,
      total,
      hasMore: skip + webhooks.length < total,
      // Handler code omitted from the list - use get_webhook
      webhooks: webhooks.map((w) => ({ ...toResult(webhookService, w), handler: undefined, hasHandler: !!w.handler })),
    };
  }
  catch (error) {
    return toError(error, 'Failed to list webhooks');
  }
};

/**
 * Handle get_webhook tool
 */
export const handleGetWebhook: ToolHandler = async (args, options) => {
  const { webhookService, userId } = requireService('get_webhook', options);
  try {
    const webhook = await webhookService.getById(userId, String(args.webhookId ?? ''));
    return { success: true, webhook: toResult(webhookService, webhook) };
  }
  catch (error) {
    return toError(error, 'Failed to get webhook');
  }
};

/**
 * Handle create_webhook tool
 */
export const handleCreateWebhook: ToolHandler = async (args, options) => {
  const { webhookService, userId } = requireService('create_webhook', options);
  try {
    const webhook = await webhookService.create(userId, {
      agentId: String(args.agentId ?? ''),
      name: String(args.name ?? ''),
      handler: optionalString(args.handler),
      template: optionalString(args.template),
    });
    return {
      success: true,
      webhook: toResult(webhookService, webhook),
      message: `Webhook "${webhook.name}" created`,
    };
  }
  catch (error) {
    return toError(error, 'Failed to create webhook');
  }
};

/**
 * Handle update_webhook tool
 */
export const handleUpdateWebhook: ToolHandler = async (args, options) => {
  const { webhookService, userId } = requireService('update_webhook', options);
  try {
    const webhook = await webhookService.update(userId, String(args.webhookId ?? ''), {
      name: optionalString(args.name),
      enabled: typeof args.enabled === 'boolean' ? args.enabled : undefined,
      handler: optionalString(args.handler),
    });
    return {
      success: true,
      webhook: toResult(webhookService, webhook),
      message: `Webhook "${webhook.name}" updated`,
    };
  }
  catch (error) {
    return toError(error, 'Failed to update webhook');
  }
};

/**
 * Handle delete_webhook tool
 */
export const handleDeleteWebhook: ToolHandler = async (args, options) => {
  const { webhookService, userId } = requireService('delete_webhook', options);
  try {
    await webhookService.delete(userId, String(args.webhookId ?? ''));
    return { success: true, message: 'Webhook deleted' };
  }
  catch (error) {
    return toError(error, 'Failed to delete webhook');
  }
};

/**
 * Handle test_webhook tool
 */
export const handleTestWebhook: ToolHandler = async (args, options) => {
  const { webhookService, userId } = requireService('test_webhook', options);
  try {
    const body = args.body ?? {};
    const result = await webhookService.test(userId, String(args.webhookId ?? ''), {
      method: String(args.method ?? 'POST'),
      headers: (args.headers as Record<string, string> | undefined) ?? {},
      query: (args.query as Record<string, string> | undefined) ?? {},
      body,
      rawBody: JSON.stringify(body),
    });
    return { success: !result.error, ...result };
  }
  catch (error) {
    return toError(error, 'Failed to test webhook');
  }
};
