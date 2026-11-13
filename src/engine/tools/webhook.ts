/**
 * Webhook management tools (Agent Builder)
 */

import type { BuiltinToolDefinition } from './types.js';
import { PAGING_PARAMETERS, PAGING_HINT } from './paging.js';

const HANDLER_DESC = `Optional JS handler source (null/empty = start the agent with { body, headers, query }).
Must define: async function handle(request, ctx) { ... }
- request: { method, headers (lower-case), query, body (parsed), rawBody }
- ctx.runAgent(input) starts an agent run; await it to get { runId, status, output, error }
- ctx.secrets: user secrets (e.g. signing keys)
- return { status?, headers?, body? } or nothing (default: 202 { runId } if a run started)
Prefer starting from a template (list_webhook_templates).`;

export const LIST_WEBHOOK_TEMPLATES_TOOL: BuiltinToolDefinition = {
  type: 'builtin',
  name: 'list_webhook_templates',
  description: 'List ready-made webhook handlers (e.g. Slack, GitHub, Telegram) with their code and the user secrets they need.',
  parameters: {
    type: 'object',
    properties: {},
  },
};

export const LIST_WEBHOOKS_TOOL: BuiltinToolDefinition = {
  type: 'builtin',
  name: 'list_webhooks',
  description: `List webhooks (public URLs that start an agent run). ${PAGING_HINT}`,
  parameters: {
    type: 'object',
    properties: {
      agentId: { type: 'string', description: 'Only webhooks of this agent' },
      name: { type: 'string', description: 'Filter by name (contains, case-insensitive)' },
      ...PAGING_PARAMETERS,
    },
  },
};

export const GET_WEBHOOK_TOOL: BuiltinToolDefinition = {
  type: 'builtin',
  name: 'get_webhook',
  description: 'Get a webhook by id, including its URL and handler code.',
  parameters: {
    type: 'object',
    properties: {
      webhookId: { type: 'string', description: 'Webhook id' },
    },
    required: ['webhookId'],
  },
};

export const CREATE_WEBHOOK_TOOL: BuiltinToolDefinition = {
  type: 'builtin',
  name: 'create_webhook',
  description: 'Create a webhook for a saved agent. Returns its public URL. Saved immediately.',
  parameters: {
    type: 'object',
    properties: {
      agentId: { type: 'string', description: 'Agent to run' },
      name: { type: 'string', description: 'Webhook name' },
      template: { type: 'string', description: 'Template id to use as the handler (ignored if handler is given)' },
      handler: { type: 'string', description: HANDLER_DESC },
    },
    required: ['agentId', 'name'],
  },
};

export const UPDATE_WEBHOOK_TOOL: BuiltinToolDefinition = {
  type: 'builtin',
  name: 'update_webhook',
  description: 'Update a webhook. Only the provided fields change. Pass handler: "" to remove the handler. Saved immediately.',
  parameters: {
    type: 'object',
    properties: {
      webhookId: { type: 'string', description: 'Webhook id' },
      name: { type: 'string', description: 'Webhook name' },
      enabled: { type: 'boolean', description: 'Whether the URL accepts requests' },
      handler: { type: 'string', description: HANDLER_DESC },
    },
    required: ['webhookId'],
  },
};

export const DELETE_WEBHOOK_TOOL: BuiltinToolDefinition = {
  type: 'builtin',
  name: 'delete_webhook',
  description: 'Delete a webhook. Its URL stops working. This action cannot be undone.',
  parameters: {
    type: 'object',
    properties: {
      webhookId: { type: 'string', description: 'Webhook id' },
    },
    required: ['webhookId'],
  },
};

export const TEST_WEBHOOK_TOOL: BuiltinToolDefinition = {
  type: 'builtin',
  name: 'test_webhook',
  description: `Dry-run a webhook handler with a sample request. No agent runs are started.
Returns { response, runs (the inputs the agent would receive), logs, error }.`,
  parameters: {
    type: 'object',
    properties: {
      webhookId: { type: 'string', description: 'Webhook id' },
      method: { type: 'string', description: 'HTTP method (default: POST)' },
      headers: { type: 'object', description: 'Request headers (lower-case names)' },
      query: { type: 'object', description: 'Query parameters' },
      body: { type: 'object', description: 'Parsed JSON body' },
    },
    required: ['webhookId'],
  },
};

export const WEBHOOK_TOOLS = [
  LIST_WEBHOOK_TEMPLATES_TOOL,
  LIST_WEBHOOKS_TOOL,
  GET_WEBHOOK_TOOL,
  CREATE_WEBHOOK_TOOL,
  UPDATE_WEBHOOK_TOOL,
  DELETE_WEBHOOK_TOOL,
  TEST_WEBHOOK_TOOL,
];
