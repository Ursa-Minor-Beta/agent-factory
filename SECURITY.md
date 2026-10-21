# Security Policy

> **Please do not report security vulnerabilities through public issues, discussions, or pull requests.**

Thank you for helping keep Agent Factory and its users safe.

## Supported versions

Agent Factory is under active development and does not yet publish versioned releases. Breaking changes may occur.

| Version                      | Supported |
| ---------------------------- | --------- |
| Latest commit on `master`    | Yes       |
| Older commits, forks, tags   | No        |

Security fixes are applied to `master` only. If you run Agent Factory, please keep your deployment up to date. Once tagged releases exist, this table will be updated.

## Reporting a vulnerability

Report them privately using either option:

- **GitHub private vulnerability reporting (preferred):** open the repository's [Security tab](https://github.com/Ursa-Minor-Beta/agent-factory/security) and click **Report a vulnerability**.
- **Email:** SECURITY_EMAIL

Please include as much of the following as you can:

- The type of issue (e.g., authentication bypass, injection, SSRF, sandbox escape, data exposure)
- The affected endpoint, node type, or source file
- The commit hash or Docker image you tested against
- Step-by-step instructions to reproduce, ideally with a minimal proof of concept
- The impact and how an attacker could exploit it
- Your suggested fix, if you have one

## What to expect

- **Acknowledgment:** within 3 business days.
- **Assessment:** we will confirm the issue, determine severity, and may ask for more details.
- **Fix:** we will work on a fix and keep you updated on progress. Timelines depend on severity and complexity.
- **Disclosure:** once a fix is available, we will publish a GitHub security advisory. We follow coordinated disclosure and ask for up to 90 days before public disclosure.
- **Credit:** with your permission, we will credit you in the advisory.

## Scope

In scope (this repository, `Ursa-Minor-Beta/agent-factory`):

- Authentication and authorization: JWT access/refresh tokens, API keys (`af_live_...`), httpOnly cookies, admin account handling
- Multi-user and workspace isolation (access to agents, secrets, collections, providers, sessions, files across users or workspaces)
- Encryption and handling of provider API keys and secrets
- Workflow execution nodes, especially `js` (code execution) and `http` (outbound requests / SSRF)
- Builtin tools and the Agent Creator system agent (privilege escalation, unauthorized agent or memory changes)
- File storage and memory/collection APIs
- Default configuration in the `Dockerfile` and `docker-compose` files

Out of scope:

- Vulnerabilities in third-party dependencies with no impact on Agent Factory (report those upstream, but let us know if we're affected)
- Vulnerabilities in the separate [agent-factory-ui](https://github.com/Ursa-Minor-Beta/agent-factory-ui) and [agent-factory-docker-api-ui](https://github.com/Ursa-Minor-Beta/agent-factory-docker-api-ui) repositories (please report them in those repositories)
- Weaknesses that require a deployment that ignores the hardening guidance below (e.g., running with example credentials)
- Attacks that require an already-authenticated administrator to act against their own instance, such as an admin intentionally running code through the `js` node
- Behavior of third-party LLM providers (OpenAI, Anthropic, Ollama), and model output quality or hallucinations
- Denial of service through sheer traffic volume, and automated scanner output without a demonstrated impact

## Deployment hardening

If you self-host Agent Factory, please:

- Set strong, unique values for `JWT_SECRET`, `ENCRYPTION_KEY` (32-byte hex), and `ADMIN_PASSWORD`. Never use the example values from `.env.example`.
- Set `ALLOWED_ORIGINS` explicitly. Leaving it empty allows all origins.
- Run behind HTTPS (e.g., a reverse proxy) and set `NODE_ENV=production`.
- Do not expose MongoDB to the public internet, and enable authentication on it.
- Back up and protect `ENCRYPTION_KEY`; losing or leaking it affects all stored provider keys.
- Treat agents with `js` or `http` nodes as code with network access. Only let trusted users create or edit them.
- Be aware that agents with builtin tools can be influenced by prompt injection in untrusted input (user messages, web content, or files). Limit what untrusted input can reach.
- Rotate API keys and provider credentials if you suspect exposure.

## Good-faith research

We will not pursue legal action against researchers who act in good faith: test only against your own instances, avoid accessing other people's data, avoid degrading service for others, and report findings to us privately and promptly.
