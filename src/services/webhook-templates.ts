export interface WebhookTemplate {
  id: string;
  name: string;
  description: string;
  /** User secrets the handler reads via ctx.secrets */
  requiredSecrets: string[];
  code: string;
}

const custom = `/**
 * Custom webhook handler - reference of everything available
 *
 * Runs on every request to this webhook URL, before any agent run.
 * Sandboxed JS: no network, no require/import. Time limit ~1s of own code
 * (time spent awaiting ctx.run / ctx.isDuplicate is not counted).
 *
 * ─── request ───────────────────────────────────────────────────────────────
 * request.method   string                  'POST'
 * request.headers  Record<string, string>  lower-case names; Authorization/Cookie are stripped
 * request.query    Record<string, string>  URL query parameters
 * request.body     any                     parsed by Content-Type:
 *                                            application/json      -> object (raw string if invalid)
 *                                            x-www-form-urlencoded -> object; a JSON "payload" field is decoded
 *                                            anything else         -> string
 *                                            empty                 -> null
 * request.rawBody  string                  exact body as received - use it for signature checks
 *
 * ─── ctx ───────────────────────────────────────────────────────────────────
 * ctx.secrets      Record<string, string>  user secrets (workspace of the agent takes precedence)
 * ctx.vars         Record<string, string>  user variables (same scoping)
 * ctx.hmacSha256(secret, data) -> string   HMAC-SHA256 as lower-case hex
 * ctx.safeEqual(a, b)          -> boolean  constant-time string comparison (use for secrets/signatures)
 * ctx.now()                    -> number   current unix time in seconds
 * ctx.isDuplicate(key)         -> Promise<boolean>
 *                                          true if the same key was seen by this webhook in the last
 *                                          10 minutes; the first call records it
 * ctx.run(input)               -> thenable starts an agent run immediately with the given input object
 *                                          - not awaited: fire-and-forget, handler continues
 *                                          - awaited: resolves when the run finishes with
 *                                            { runId, status, output, error }
 *                                            status: 'completed' | 'failed' | 'cancelled'
 *                                                    | 'running' (wait timed out, run continues)
 *                                          max 10 runs per request
 *
 * ─── return ────────────────────────────────────────────────────────────────
 * The HTTP response for the caller. Every field is optional; returning nothing uses defaults.
 * {
 *   status?:  number                  default: 202 if a run was started, otherwise 200
 *   headers?: Record<string, string>  extra response headers
 *   body?:    any                     object -> JSON, string -> text;
 *                                     default: { runId } / { runIds } if runs started, otherwise empty
 * }
 *
 * Throwing an error (or exceeding limits) responds 500 and starts nothing that wasn't started yet.
 * Use "Test" to dry-run the handler: runs are recorded but not started.
 */
async function handle(request, ctx) {
  const { secrets, vars, hmacSha256, safeEqual, now, isDuplicate, run } = ctx;

  // 1. Authenticate (pick one; the URL token already protects the endpoint)
  //    a) shared header token
  //    if (!safeEqual(secrets.MY_WEBHOOK_TOKEN ?? '', request.headers['x-my-token'] ?? '')) return { status: 401 };
  //    b) HMAC signature of the raw body
  //    const expected = 'sha256=' + hmacSha256(secrets.MY_WEBHOOK_SECRET, request.rawBody);
  //    if (!safeEqual(expected, request.headers['x-signature'] ?? '')) return { status: 401 };
  //    c) reject old requests (replay protection), if the sender includes a timestamp
  //    if (Math.abs(now() - Number(request.headers['x-timestamp'])) > 300) return { status: 401 };

  // 2. Filter - acknowledge with 200 but don't run the agent
  if (request.method !== 'POST') return { status: 405 };
  // if (request.body?.type !== 'order.paid') return { status: 200 };

  // 3. Deduplicate redeliveries by a unique id from the sender
  const deliveryId = request.headers['x-delivery-id'] ?? request.body?.id;
  if (deliveryId && await isDuplicate(String(deliveryId))) return { status: 200 };

  // 4. Shape the agent input - this object becomes the input of the agent's input node
  const input = {
    body: request.body,
    query: request.query,
    source: request.headers['user-agent'] ?? null,
    env: vars.ENVIRONMENT ?? null,
  };

  // 5a. Fire-and-forget: respond immediately (default 202 { runId })
  run(input);
  return;

  // 5b. Or wait for the agent and return its output synchronously:
  // const result = await run(input);
  // if (result.status !== 'completed') {
  //   return { status: result.status === 'running' ? 202 : 500, body: { runId: result.runId, status: result.status, error: result.error } };
  // }
  // return { status: 200, headers: { 'x-run-id': result.runId }, body: result.output };
}
`;

const slack = `/**
 * Slack webhook handler
 *
 * Setup:
 *  1. Create a Slack app, copy Basic Information -> Signing Secret into secret SLACK_SIGNING_SECRET
 *  2. Paste this webhook URL into any of:
 *     - Event Subscriptions -> Request URL (subscribe to app_mention, message.im, ...)
 *     - Slash Commands -> Request URL
 *     - Interactivity & Shortcuts -> Request URL
 *  3. To reply, the agent calls chat.postMessage with a bot token (e.g. secret SLACK_BOT_TOKEN)
 *     or posts to responseUrl for slash commands / interactions
 *
 * Slack expects a 200 within 3 seconds, so runs are started without await.
 *
 * request: { method, headers (lower-case), query, body (parsed), rawBody }
 * ctx.run(input)        - starts an agent run; await it to get { runId, status, output, error }
 * ctx.isDuplicate(key)  - true if the key was seen in the last 10 minutes (Slack may redeliver)
 * Return { status?, headers?, body? } - the HTTP response sent back to Slack
 */
async function handle(request, { secrets, hmacSha256, safeEqual, now, run, isDuplicate }) {
  const secret = secrets.SLACK_SIGNING_SECRET;
  if (!secret) throw new Error('Secret SLACK_SIGNING_SECRET is not set');

  // Verify signature: v0=HMAC(secret, "v0:{timestamp}:{rawBody}"), reject replays older than 5 min
  const ts = Number(request.headers['x-slack-request-timestamp']);
  const expected = 'v0=' + hmacSha256(secret, 'v0:' + ts + ':' + request.rawBody);
  if (!safeEqual(expected, request.headers['x-slack-signature'] ?? '') || Math.abs(now() - ts) > 300) {
    return { status: 401 };
  }

  // Slack retries a delivery if we were slow - the first attempt already started a run
  if (request.headers['x-slack-retry-num']) return { status: 200 };

  const b = request.body;

  // One-time check when the Request URL is saved in Event Subscriptions: echo the challenge back
  if (b.type === 'url_verification') {
    return { body: { challenge: b.challenge } };
  }

  // Slash command (form-encoded: command, text, user_id, channel_id, response_url, trigger_id, ...)
  // The returned body is shown to the user immediately; the agent posts the real answer to responseUrl
  if (b.command) {
    if (await isDuplicate(b.trigger_id)) return { status: 200 };
    run({
      kind: 'command', command: b.command, text: b.text,
      user: b.user_id, channel: b.channel_id, responseUrl: b.response_url,
    });
    return { status: 200, body: { response_type: 'ephemeral', text: 'On it…' } };
  }

  // Interactivity: button clicks, modal submissions (form-encoded "payload" JSON, already decoded)
  if (b.payload) {
    const p = b.payload;
    if (await isDuplicate(p.trigger_id)) return { status: 200 };
    run({
      kind: 'interaction', type: p.type, user: p.user?.id, channel: p.channel?.id ?? null,
      responseUrl: p.response_url ?? null, payload: p,
    });
    return { status: 200 };
  }

  // Events API: b.event holds the actual event (message, app_mention, reaction_added, ...)
  if (b.type === 'event_callback') {
    const e = b.event;
    // Skip bot messages (including our own replies) to avoid reply loops
    if (e.bot_id || e.subtype === 'bot_message') return { status: 200 };
    // Only react to these event types - extend as needed
    if (!['app_mention', 'message'].includes(e.type)) return { status: 200 };
    if (await isDuplicate(b.event_id)) return { status: 200 };
    run({
      kind: 'event', type: e.type, text: e.text,
      // Reply in the thread: existing thread or start one under the message
      user: e.user, channel: e.channel, threadTs: e.thread_ts ?? e.ts,
    });
    return { status: 200 };
  }

  // Anything else: acknowledge so Slack doesn't retry
  return { status: 200 };
}
`;

const github = `/**
 * GitHub webhook handler
 *
 * Setup (repo or org -> Settings -> Webhooks -> Add webhook):
 *  - Payload URL: this webhook URL
 *  - Content type: application/json (form-encoded also works)
 *  - Secret: any random string, saved as secret GITHUB_WEBHOOK_SECRET
 *  - Events: choose which ones GitHub sends (and/or filter below)
 *
 * Useful headers: x-github-event (push, pull_request, issues, ...), x-github-delivery (unique id)
 *
 * request: { method, headers (lower-case), query, body (parsed), rawBody }
 * ctx.run(input)        - starts an agent run; await it to get { runId, status, output, error }
 * ctx.isDuplicate(key)  - true if the key was seen in the last 10 minutes (redeliveries)
 * Return { status?, headers?, body? } or nothing (default: 202 { runId } if a run started)
 */
async function handle(request, { secrets, hmacSha256, safeEqual, run, isDuplicate }) {
  const secret = secrets.GITHUB_WEBHOOK_SECRET;
  if (!secret) throw new Error('Secret GITHUB_WEBHOOK_SECRET is not set');

  // Verify signature: X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(secret, rawBody)
  const expected = 'sha256=' + hmacSha256(secret, request.rawBody);
  if (!safeEqual(expected, request.headers['x-hub-signature-256'] ?? '')) {
    return { status: 401 };
  }

  const event = request.headers['x-github-event'];
  // Sent once when the webhook is created
  if (event === 'ping') return { status: 200, body: { ok: true } };

  // Filter events here, e.g.: if (!['push', 'pull_request'].includes(event)) return { status: 200 };

  // Manual "Redeliver" in GitHub UI reuses the delivery id
  if (await isDuplicate(request.headers['x-github-delivery'])) return { status: 200 };

  // Form-encoded deliveries wrap the JSON in "payload"
  const p = request.body.payload ?? request.body;
  // Not awaited: GitHub times out after 10s, respond 202 { runId } right away
  run({
    event,
    action: p.action ?? null,
    repository: p.repository?.full_name ?? null,
    sender: p.sender?.login ?? null,
    payload: p,
  });
}
`;

const telegram = `/**
 * Telegram bot webhook handler
 *
 * Setup:
 *  1. Create a bot with @BotFather, save the bot token as secret TELEGRAM_BOT_TOKEN (used by the agent to reply)
 *  2. Pick a random string (A-Z, a-z, 0-9, _, -) and save it as secret TELEGRAM_WEBHOOK_SECRET
 *  3. Register the webhook:
 *     https://api.telegram.org/bot<TOKEN>/setWebhook?url=<this webhook URL>&secret_token=<TELEGRAM_WEBHOOK_SECRET>
 *  4. To reply, the agent calls sendMessage: { chat_id: chatId, text, reply_to_message_id: messageId }
 *
 * Telegram retries until it gets a 2xx, so always answer quickly (runs are started without await).
 *
 * request: { method, headers (lower-case), query, body (parsed Update), rawBody }
 * ctx.run(input)        - starts an agent run; await it to get { runId, status, output, error }
 * ctx.isDuplicate(key)  - true if the key was seen in the last 10 minutes
 * Return { status?, headers?, body? } - the HTTP response sent back to Telegram
 */
async function handle(request, { secrets, safeEqual, run, isDuplicate }) {
  const secret = secrets.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) throw new Error('Secret TELEGRAM_WEBHOOK_SECRET is not set');

  // Telegram sends the secret_token from setWebhook in this header
  if (!safeEqual(secret, request.headers['x-telegram-bot-api-secret-token'] ?? '')) {
    return { status: 401 };
  }

  // Update: https://core.telegram.org/bots/api#update
  const u = request.body;
  const m = u.message ?? u.edited_message ?? u.channel_post;
  // Ignore other update types (callback_query, my_chat_member, ...) and messages from bots
  if (!m || m.from?.is_bot) return { status: 200 };
  // update_id is unique per update - protects against redelivery
  if (await isDuplicate(String(u.update_id))) return { status: 200 };

  run({
    updateId: u.update_id,
    chatId: m.chat.id,
    messageId: m.message_id,
    // Photos/documents carry text in caption
    text: m.text ?? m.caption ?? '',
    from: m.from ?? null,
    payload: u,
  });
  return { status: 200 };
}
`;

export const WEBHOOK_TEMPLATES: WebhookTemplate[] = [
  {
    id: 'custom',
    name: 'Starter',
    description: 'Annotated starting point: every request field, ctx helper and response option, with auth, filter, dedupe and sync/async run examples.',
    requiredSecrets: [],
    code: custom,
  },
  {
    id: 'slack',
    name: 'Slack',
    description: 'Events API, slash commands and interactivity. Verifies Slack signature, answers URL verification, skips retries and bot messages.',
    requiredSecrets: ['SLACK_SIGNING_SECRET'],
    code: slack,
  },
  {
    id: 'github',
    name: 'GitHub',
    description: 'Repository/organization webhooks. Verifies X-Hub-Signature-256, answers ping.',
    requiredSecrets: ['GITHUB_WEBHOOK_SECRET'],
    code: github,
  },
  {
    id: 'telegram',
    name: 'Telegram',
    description: 'Bot API updates. Verifies X-Telegram-Bot-Api-Secret-Token (secret_token from setWebhook).',
    requiredSecrets: ['TELEGRAM_WEBHOOK_SECRET'],
    code: telegram,
  },
];
