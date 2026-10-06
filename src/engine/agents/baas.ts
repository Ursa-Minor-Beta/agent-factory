/**
 * Timeouts for agents that drive BaaS async sessions.
 *
 * BaaS answers /api/async/message within the message's own `timeout` and
 * cuts it at 30s when none is given; the HTTP node aborts at 30s by default
 * too. A login or test step routinely runs longer. Both stay under
 * Cloudflare's 100s limit for a response that has not started yet.
 */
export const BAAS_MESSAGE_TIMEOUT = '90s';
export const BAAS_HTTP_TIMEOUT_MS = 95_000;
