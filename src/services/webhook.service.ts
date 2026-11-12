import crypto from 'crypto';
import vm from 'node:vm';
import type { IWebhookRepository } from '../domain/interfaces/repositories/IWebhookRepository.js';
import type { IAgentRepository } from '../domain/interfaces/repositories/IAgentRepository.js';
import type { IUserSecretRepository } from '../domain/interfaces/repositories/IUserSecretRepository.js';
import type { IUserVariableRepository } from '../domain/interfaces/repositories/IUserVariableRepository.js';
import type { Webhook, WebhookQueryOptions, WebhookListResult } from '../domain/entities/Webhook.js';
import type { Run } from '../domain/entities/Run.js';
import type { RunService } from './run.service.js';
import { UserSecretService } from './user-secret.service.js';
import { UserVariableService } from './user-variable.service.js';
import { WEBHOOK_TEMPLATES } from './webhook-templates.js';
import { encrypt, decrypt } from '../utils/crypto.js';
import { runInSandbox, SandboxError, type SandboxLogEntry } from '../utils/sandbox.js';
import { resolveRunOutput } from '../utils/node-ref.js';
import { config } from '../config/index.js';
import { NotFoundError, ForbiddenError, ValidationError, AppError } from '../utils/errors.js';

export interface WebhookRequest {
  method: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  body: unknown;
  rawBody: string;
}

/** HTTP response returned by a custom handler (all fields optional) */
export interface WebhookHandlerResponse {
  status?: number;
  headers?: Record<string, string>;
  body?: unknown;
}

/** Result of `await ctx.runAgent(input)` inside a handler */
export interface WebhookRunResult {
  runId: string;
  /** 'running' if the wait timed out */
  status: string;
  output: Record<string, unknown> | null;
  error: string | null;
}

export interface WebhookResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

export interface WebhookTestResult {
  response: WebhookHandlerResponse | null;
  /** Runs the handler would have started */
  runs: { input: Record<string, unknown> }[];
  logs: SandboxLogEntry[];
  error?: string;
}

/** Host side of ctx.runAgent / ctx.isDuplicate - real for triggers, recording for dry runs */
interface HandlerHost {
  startRun(input: Record<string, unknown>): Promise<string>;
  waitRun(runId: string): Promise<WebhookRunResult>;
  isDuplicate(key: string): boolean;
}

const RATE_WINDOW_MS = 60_000;
const DEDUPE_TTL_MS = 10 * 60_000;
const MAX_TRACKED_KEYS = 10_000;
const MAX_RUNS_PER_REQUEST = 10;

function generateToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

function tokensEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Script evaluated in the sandbox: builds ctx and calls the user's handle().
 * ctx.runAgent() starts the run right away and returns a thenable - awaiting it waits for the result.
 */
function buildHandlerScript(handler: string): string {
  return `(async () => {
const __ctx = {
  secrets, vars, hmacSha256, safeEqual, now,
  isDuplicate: (key) => __isDuplicate(String(key)),
  runAgent: (input) => {
    const started = __startRun(input);
    started.catch(() => {});
    let waited;
    return {
      then(onFulfilled, onRejected) {
        waited ??= started.then((runId) => __waitRun(runId));
        return waited.then(onFulfilled, onRejected);
      },
    };
  },
};
return (async () => {
${handler}
;return handle(request, __ctx);
})();
})()`;
}

const HANDLER_HOST_METHODS = ['__startRun', '__waitRun', '__isDuplicate'];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Validate the response returned by user code (undefined = default) */
function parseHandlerResponse(value: unknown): WebhookHandlerResponse | null {
  if (value === undefined || value === null) return null;
  if (!isPlainObject(value)) {
    throw new Error('Handler must return an object { status?, headers?, body? } or nothing');
  }
  const { status, headers } = value;
  if (status !== undefined && (!Number.isInteger(status) || (status as number) < 100 || (status as number) > 599)) {
    throw new Error('Handler result "status" must be a valid HTTP status');
  }
  if (headers !== undefined && (!isPlainObject(headers) || Object.values(headers).some((h) => typeof h !== 'string'))) {
    throw new Error('Handler result "headers" must be an object of strings');
  }
  return value as WebhookHandlerResponse;
}

export class WebhookService {
  // Single instance deployment: in-memory rate limit / dedupe state is fine
  private hits = new Map<string, number[]>();
  private seen = new Map<string, number>();
  private userSecretService: UserSecretService;
  private userVariableService: UserVariableService;

  constructor(
    private webhookRepo: IWebhookRepository,
    private agentRepo: IAgentRepository,
    private runService: RunService,
    userSecretRepo: IUserSecretRepository,
    userVariableRepo: IUserVariableRepository
  ) {
    this.userSecretService = new UserSecretService(userSecretRepo);
    this.userVariableService = new UserVariableService(userVariableRepo);
  }

  /** Webhook with decrypted token */
  private reveal(webhook: Webhook): Webhook {
    return { ...webhook, token: decrypt(webhook.token) };
  }

  buildUrl(webhook: Webhook): string {
    return `${config.webhooks.publicBaseUrl}/hooks/${webhook.id}/${webhook.token}`;
  }

  getTemplates() {
    return WEBHOOK_TEMPLATES;
  }

  private async assertAgentOwner(userId: string, agentId: string): Promise<void> {
    const agent = await this.agentRepo.findById(agentId);
    if (!agent) {
      throw new NotFoundError('Agent');
    }
    if (agent.userId !== userId) {
      throw new ForbiddenError('Access denied');
    }
  }

  /** Empty handler = none; otherwise it must at least compile */
  private normalizeHandler(handler: string | null | undefined): string | null | undefined {
    if (handler === undefined) return undefined;
    if (handler === null || !handler.trim()) return null;
    try {
      new vm.Script(buildHandlerScript(handler));
    }
    catch (error) {
      throw new ValidationError(`Handler syntax error: ${error instanceof Error ? error.message : String(error)}`);
    }
    return handler;
  }

  async list(userId: string, options: WebhookQueryOptions = {}): Promise<WebhookListResult> {
    if (options.agentId) {
      await this.assertAgentOwner(userId, options.agentId);
    }
    const { webhooks, total } = await this.webhookRepo.findByUserId(userId, options);
    return { webhooks: webhooks.map((w) => this.reveal(w)), total };
  }

  async getById(userId: string, id: string): Promise<Webhook> {
    const webhook = await this.webhookRepo.findById(id);
    if (!webhook) {
      throw new NotFoundError('Webhook');
    }
    if (webhook.userId !== userId) {
      throw new ForbiddenError('Access denied');
    }
    return this.reveal(webhook);
  }

  async create(
    userId: string,
    data: { agentId: string; name: string; handler?: string | null; template?: string }
  ): Promise<Webhook> {
    if (!data.name.trim()) {
      throw new ValidationError('Webhook name is required');
    }
    let handler = data.handler;
    if (data.template && handler === undefined) {
      const template = WEBHOOK_TEMPLATES.find((t) => t.id === data.template);
      if (!template) {
        throw new ValidationError(`Unknown webhook template: ${data.template}`);
      }
      handler = template.code;
    }
    await this.assertAgentOwner(userId, data.agentId);
    const webhook = await this.webhookRepo.create({
      userId,
      agentId: data.agentId,
      name: data.name,
      token: encrypt(generateToken()),
      handler: this.normalizeHandler(handler) ?? null,
    });
    return this.reveal(webhook);
  }

  async update(
    userId: string,
    id: string,
    data: { name?: string; enabled?: boolean; handler?: string | null }
  ): Promise<Webhook> {
    await this.getById(userId, id);
    if (data.name !== undefined && !data.name.trim()) {
      throw new ValidationError('Webhook name is required');
    }
    const updated = await this.webhookRepo.update(id, {
      ...data,
      handler: this.normalizeHandler(data.handler),
    });
    if (!updated) {
      throw new NotFoundError('Webhook');
    }
    return this.reveal(updated);
  }

  async rotateToken(userId: string, id: string): Promise<Webhook> {
    await this.getById(userId, id);
    const updated = await this.webhookRepo.update(id, { token: encrypt(generateToken()) });
    if (!updated) {
      throw new NotFoundError('Webhook');
    }
    return this.reveal(updated);
  }

  async delete(userId: string, id: string): Promise<void> {
    await this.getById(userId, id);
    await this.webhookRepo.delete({ id });
  }

  private checkRateLimit(webhookId: string): void {
    const now = Date.now();
    const recent = (this.hits.get(webhookId) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
    if (recent.length >= config.webhooks.rateLimitPerMinute) {
      this.hits.set(webhookId, recent);
      throw new AppError('Webhook rate limit exceeded', 429, 'RATE_LIMITED');
    }
    recent.push(now);
    this.hits.set(webhookId, recent);
  }

  /** Returns true if the key was already seen within the TTL; records it otherwise */
  private isDuplicate(webhookId: string, dedupeKey: string): boolean {
    const now = Date.now();
    if (this.seen.size > MAX_TRACKED_KEYS) {
      for (const [key, expiresAt] of this.seen) {
        if (expiresAt <= now) this.seen.delete(key);
      }
    }
    const key = `${webhookId}:${dedupeKey}`;
    const expiresAt = this.seen.get(key);
    if (expiresAt && expiresAt > now) return true;
    this.seen.set(key, now + DEDUPE_TTL_MS);
    return false;
  }

  /** Run the custom handler in the sandbox */
  private async executeHandler(
    webhook: Webhook & { handler: string },
    request: WebhookRequest,
    host: HandlerHost
  ): Promise<{ response: WebhookHandlerResponse | null; logs: SandboxLogEntry[] }> {
    const agent = await this.agentRepo.findById(webhook.agentId);
    if (!agent) {
      throw new NotFoundError('Agent');
    }
    const [secrets, vars] = await Promise.all([
      this.userSecretService.buildSecretsMap(webhook.userId, agent.workspaceId),
      this.userVariableService.buildVariablesMap(webhook.userId, agent.workspaceId),
    ]);

    let runCount = 0;
    const { result, logs } = await runInSandbox({
      script: buildHandlerScript(webhook.handler),
      data: { request, secrets, vars },
      cryptoHelpers: true,
      hostMethods: HANDLER_HOST_METHODS,
      onHostCall: async (method, args) => {
        switch (method) {
        case '__startRun': {
          const input = args[0] ?? {};
          if (!isPlainObject(input)) throw new Error('runAgent(input): input must be an object');
          if (++runCount > MAX_RUNS_PER_REQUEST) {
            throw new Error(`runAgent(): max ${MAX_RUNS_PER_REQUEST} runs per request`);
          }
          return host.startRun(input);
        }
        case '__waitRun':
          return host.waitRun(String(args[0]));
        case '__isDuplicate':
          return host.isDuplicate(String(args[0]));
        default:
          throw new Error(`Unknown host method ${method}`);
        }
      },
      timeout: config.webhooks.handlerTimeoutMs,
      memoryMb: config.webhooks.handlerMemoryMb,
      label: 'Webhook handler',
    });

    try {
      return { response: parseHandlerResponse(result), logs };
    }
    catch (error) {
      throw new SandboxError(error instanceof Error ? error.message : String(error), logs);
    }
  }

  /** Real host: starts agent runs tagged with this webhook */
  private createHost(webhook: Webhook, runIds: string[]): HandlerHost {
    const completions = new Map<string, Promise<Run | null>>();
    return {
      startRun: async (input) => {
        const { run, completion } = await this.runService.start(
          webhook.userId,
          webhook.agentId,
          input,
          { triggerType: 'webhook', webhookId: webhook.id }
        );
        runIds.push(run.id);
        completions.set(run.id, completion);
        return run.id;
      },
      waitRun: async (runId) => {
        const completion = completions.get(runId);
        if (!completion) throw new Error(`Unknown run ${runId}`);
        const timedOut = Symbol('timeout');
        let timer: NodeJS.Timeout | undefined;
        const run = await Promise.race([
          completion,
          new Promise<typeof timedOut>((resolve) => {
            timer = setTimeout(() => resolve(timedOut), config.webhooks.runWaitTimeoutMs);
          }),
        ]);
        clearTimeout(timer);
        if (run === timedOut || !run) {
          return { runId, status: 'running', output: null, error: null };
        }
        return {
          runId,
          status: run.status,
          output: run.status === 'completed' ? resolveRunOutput(run) : null,
          error: run.error,
        };
      },
      isDuplicate: (key) => this.isDuplicate(webhook.id, key),
    };
  }

  /**
   * Public trigger: validate token, run the handler (or start the agent with the raw request).
   * Token failures are reported as not found to avoid leaking webhook existence.
   */
  async trigger(id: string, token: string, request: WebhookRequest): Promise<WebhookResponse> {
    const webhook = await this.webhookRepo.findById(id);
    if (!webhook || !webhook.enabled || !tokensEqual(decrypt(webhook.token), token)) {
      throw new NotFoundError('Webhook');
    }

    this.checkRateLimit(webhook.id);

    const runIds: string[] = [];
    const host = this.createHost(webhook, runIds);
    let response: WebhookHandlerResponse | null = null;

    if (webhook.handler) {
      try {
        ({ response } = await this.executeHandler({ ...webhook, handler: webhook.handler }, request, host));
      }
      catch (error) {
        if (error instanceof AppError) throw error;
        const logs = error instanceof SandboxError ? error.logs : [];
        console.error(`[Webhook:${webhook.id}] handler failed:`, error instanceof Error ? error.message : error, logs);
        throw new AppError('Webhook handler failed', 500, 'WEBHOOK_HANDLER_FAILED');
      }
    }
    else {
      await host.startRun({ body: request.body, headers: request.headers, query: request.query });
    }

    if (runIds.length > 0) {
      await this.webhookRepo.update(webhook.id, { lastTriggeredAt: new Date() });
    }

    const defaultBody = runIds.length === 0 ? null : runIds.length === 1 ? { runId: runIds[0] } : { runIds };
    return {
      status: response?.status ?? (runIds.length > 0 ? 202 : 200),
      headers: response?.headers ?? {},
      body: response?.body !== undefined ? response.body : defaultBody,
    };
  }

  /** Dry run of the handler: no run is started, nothing is recorded */
  async test(userId: string, id: string, request: WebhookRequest): Promise<WebhookTestResult> {
    const webhook = await this.getById(userId, id);
    const runs: { input: Record<string, unknown> }[] = [];

    if (!webhook.handler) {
      return {
        response: null,
        runs: [{ input: { body: request.body, headers: request.headers, query: request.query } }],
        logs: [],
      };
    }

    const host: HandlerHost = {
      startRun: async (input) => {
        runs.push({ input });
        return `dry-run-${runs.length}`;
      },
      waitRun: async (runId) => ({ runId, status: 'skipped', output: null, error: null }),
      isDuplicate: () => false,
    };

    try {
      const { response, logs } = await this.executeHandler({ ...webhook, handler: webhook.handler }, request, host);
      return { response, runs, logs };
    }
    catch (error) {
      return {
        response: null,
        runs,
        logs: error instanceof SandboxError ? error.logs : [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
