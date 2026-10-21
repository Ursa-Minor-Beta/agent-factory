# Contributing to Agent Factory

Thanks for your interest in contributing! Agent Factory is a backend API for building and executing AI agent workflows using a node-graph system. This guide explains how to report bugs, suggest features, and submit pull requests.

> **Heads up:** the project is under active development and breaking changes can happen. For larger changes, please open an issue to discuss first.

## Ways to contribute

- **Report bugs** by opening an issue
- **Suggest features** or improvements
- **Improve documentation** (README, API docs, examples)
- **Fix bugs or add features** via pull requests

## Claiming an issue

Before starting work on an issue, comment on it to let others know you're taking it. This avoids duplicate effort. If you don't see activity on your comment within a few days, feel free to start working. For larger changes, wait for a maintainer to confirm the approach before investing significant time.

## Related repositories

- [agent-factory-ui](https://github.com/Ursa-Minor-Beta/agent-factory-ui): the web UI client. UI issues and PRs belong there.
- [agent-factory-docker-api-ui](https://github.com/Ursa-Minor-Beta/agent-factory-docker-api-ui): one-shot Docker deployment of API + UI.

## Reporting bugs

Search existing issues first to avoid duplicates. A good bug report includes:

- What you expected and what actually happened
- Steps to reproduce (the exact API request or workflow definition helps a lot)
- Your environment: OS, Node.js version, how you run it (local or Docker), MongoDB version, and which LLM provider
- Relevant logs or error output (**remove any API keys, tokens, or secrets first**)

**Security vulnerabilities:** do not open a public issue. Follow [SECURITY.md](SECURITY.md) and report privately.

## Suggesting features

Open an issue describing the problem you want to solve and your proposed approach. Mention which part of the system it touches (node types, builtin tools, auth, memory, workspaces, etc.).

## Development setup

**Prerequisites:** Node.js and npm, plus MongoDB (local, hosted, or via Docker). See [README.md](README.md#quick-start) for full setup instructions, environment variables, and Docker options.

1. **Fork** the repository on GitHub.
2. **Clone** your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/agent-factory.git
   cd agent-factory
   ```
3. **Add the upstream remote:**
   ```bash
   git remote add upstream https://github.com/Ursa-Minor-Beta/agent-factory.git
   ```
4. **Install and run:** follow [Quick Start](README.md#quick-start) in the README. Never commit your `.env` file.

## Making changes

1. Sync with upstream and create a branch from `master`:
   ```bash
   git fetch upstream
   git checkout -b my-change upstream/master
   ```
2. Make your changes. Keep each pull request focused on one logical change.
3. Before pushing, make sure the project lints and builds cleanly:
   ```bash
   npm run lint
   npm run build
   ```
4. Try your change against a running instance (via `/docs` or `curl`) and describe how you tested it in the PR.
5. Update the README or other docs if you change behavior, environment variables, or API endpoints.

## Code guidelines

- The project is written in **TypeScript**. Follow the existing structure and conventions in `src/`.
- Fix all ESLint errors; don't disable rules without a good reason.
- Keep new node types, builtin tools, and API routes consistent with the existing ones, and keep the Swagger documentation up to date.
- **Security matters here.** Be careful with anything touching authentication, secrets, workspace isolation, the `js` node, or the `http` node. Never log secrets or API keys, and never commit credentials.
- Don't add dependencies unless necessary, and mention why in the PR.

## Commit messages

- Use the imperative mood: "Add branch node validation", not "Added..."
- Keep the first line under 72 characters
- Reference related issues, e.g. `Fixes #123`

## Submitting a pull request

1. Push your branch to your fork:
   ```bash
   git push origin my-change
   ```
2. Open a pull request against the `master` branch of `Ursa-Minor-Beta/agent-factory`.
3. Describe what changed and why, link the related issue, and note how you tested it.
4. Make sure CI checks pass.
5. Respond to review feedback by pushing follow-up commits to the same branch; the PR updates automatically.

**Tips for faster reviews**

- Small, focused PRs get reviewed sooner.
- Explain the "why", not just the "what".
- Include example requests/responses or screenshots for behavior changes.
- Breaking changes to the API or workflow format should be called out clearly in the PR description.

## Review process

A maintainer will review your PR and may request changes or explain why a change doesn't fit the project's direction. Please don't take that personally; it's about keeping the project coherent. Once approved and passing CI, a maintainer will merge it.

## License

Agent Factory is licensed under the [Apache License 2.0](LICENSE). By submitting a contribution, you agree that it is licensed under the same terms, as described in Section 5 of the license.

## Questions?

Open an issue or start a discussion in the repository. Thanks for helping improve Agent Factory!