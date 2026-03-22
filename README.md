# Copilot Unleashed

<p align="center">
  <a href="https://github.com/devartifex/copilot-unleashed/releases/latest"><img src="https://img.shields.io/github/v/release/devartifex/copilot-unleashed?label=release&logo=github" alt="Latest Release"></a>
  <a href="https://github.com/devartifex/copilot-unleashed/actions/workflows/ci.yml"><img src="https://github.com/devartifex/copilot-unleashed/workflows/CI/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/badge/node-%3E%3D24-brightgreen?logo=node.js&logoColor=white" alt="Node ≥24">
  <img src="https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Svelte-5-orange?logo=svelte&logoColor=white" alt="Svelte 5">
  <img src="https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white" alt="Docker">
  <img src="https://img.shields.io/badge/Azure-Container%20Apps-0078D4?logo=microsoftazure&logoColor=white" alt="Azure Container Apps">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/built%20with-GitHub%20Copilot-8A2BE2?logo=githubcopilot&logoColor=white" alt="Built with GitHub Copilot">
</p>

**Every Copilot model. One login. Any device. Your server.**

The only open-source web UI built on the official [`@github/copilot-sdk`](https://github.com/github/copilot-sdk). Self-host a ChatGPT-class experience powered by your GitHub Copilot subscription — with autopilot agents, live reasoning traces, native GitHub tools, and persistent sessions that sync between the CLI and the browser.

<p align="center">
  <img src="docs/screenshots/usecase-autopilot-desktop.png" width="720" alt="Autopilot agent — reads a GitHub issue, implements the feature, runs tests, and opens a PR autonomously">
</p>
<p align="center"><em>Autopilot reads issue #88, implements the fix, runs tests, and opens a PR — zero intervention.</em></p>

<p align="center">
  <img src="docs/screenshots/usecase-reasoning-desktop.png" width="520" alt="Extended reasoning — live thinking trace from Claude Opus 4.6">
  &nbsp;&nbsp;
  <img src="docs/screenshots/chat-mobile.png" width="180" alt="Mobile chat — touch-optimized dark UI">
</p>
<p align="center"><em>Live reasoning traces on desktop · Touch-optimized mobile UI</em></p>

> Independent project — not affiliated with GitHub. MIT licensed.

---

## Why this exists

The GitHub Copilot CLI is powerful, but it's stuck in your terminal. This project wraps the same official SDK in a web UI you can reach from any device — phone, tablet, laptop — with features the CLI doesn't have: persistent sessions, a visual plan editor, file and image attachments, custom webhook tools, and real-time streaming with a dark, touch-friendly interface.

Your Copilot subscription already gives you access to Claude Opus 4.6, GPT-5.4, Gemini 3 Pro, and more through one account. This app lets you use them all from anywhere, on your own server, without handing your data to another SaaS.

---

## What you get

- **Every Copilot model** — Claude Opus 4.6, GPT-5.4, Gemini 3 Pro, Claude Sonnet 4.6, and more — switch mid-conversation, keep full history
- **Autopilot agents** — plan, code, run tests, and open PRs autonomously with live tool execution
- **Extended thinking** — live reasoning traces from Claude Opus 4.6 and Claude Sonnet 4.6 with collapsible "Thinking…" blocks
- **Native GitHub tools** — issues, PRs, code search, repos, Actions — built in via the GitHub MCP server
- **Custom MCP servers** — plug in any MCP-compatible server with per-server headers, tool filtering, and timeout control
- **Custom webhook tools** — connect Jira, Slack, databases, or internal APIs as callable tools
- **Image vision** — attach images alongside code and documents; vision-capable models analyze them inline
- **File & directory attachments** — drop in code files, images, CSVs, or whole directories with `@` mention autocomplete
- **Issue & PR references** — type `#` to search and reference GitHub issues/PRs across all your repos
- **Persistent sessions** — resume any conversation on any device with full checkpoint history; chat state survives browser close via server-side storage with cold resume from disk
- **CLI ↔ Browser sync** — sessions started in the Copilot CLI appear in the browser and vice versa, with automatic filesystem watcher and Docker bind mount for real-time sync
- **Push notifications** — Web Push alerts when the browser is closed; triggers on response ready, errors, permission prompts, and user input; full PWA support (iOS 16.4+ requires "Add to Home Screen" from Safari)
- **Plan mode** — agent creates an editable execution plan before acting; bidirectional sync with `plan.md` on disk
- **Fleet mode** — launch multi-agent parallel execution with per-agent status tracking
- **Quota tracking** — see premium request usage, remaining balance, and reset date at a glance
- **Mobile-first dark UI** — WCAG AA accessible, touch-optimized, reduced-motion support
- **Self-hosted** — your data never leaves your server; deploy with Docker or `azd up`

---

## What people do with it

**Build software by talking.** Switch to autopilot, describe what you want, walk away. The agent plans, writes code, runs tests, opens a PR.

> *"Add rate-limiting middleware to the API and write integration tests"* → done. *"Refactor the payment service to handle retries with exponential backoff"* → done.

**Analyze anything.** Drop a CSV, a screenshot, a codebase. Ask questions in plain language. Vision-capable models read images directly.

> *"Which product line had the highest return rate last quarter?"* · *"What's wrong with this UI layout?"* (with attached screenshot)

**Review PRs from your phone.** Commuting? Ask Copilot to summarize any pull request, flag security issues in the diff, and draft review comments — no laptop needed.

**Compare models on hard problems.** Ask GPT-5.4 for speed, switch to Claude Opus 4.6 for deep reasoning, then Gemini 3 Pro for a different angle. Same conversation, all history preserved.

**Watch it think.** Enable extended thinking — see the live reasoning trace in a collapsible block before the answer. You see *how* it gets there, not just what it concludes.

**Connect your own tools.** Define webhook tools or add MCP servers in the settings UI. Copilot calls your Jira, your database, your internal APIs — as part of its agentic workflow.

> *"Is the auth bug ticket still open? If so, find the related PRs and summarize the discussion"* → calls your project tracker, then searches GitHub.

**Self-host for personal use.** One `azd up`. Optionally share with a trusted team via `ALLOWED_GITHUB_USERS`. Everyone logs in with their own GitHub account — no shared API keys, no shared context.

---

## GitHub is the killer feature

Every Copilot model gets native GitHub superpowers — repos, issues, PRs, code search, Actions — all wired in through the GitHub MCP server. No plugins, no tokens to configure, no copy-pasting links. It just knows about your work.

**Spin up a project from an idea — on your phone.**

> *"Create a new public repo called 'invoice-api', scaffold a REST API with JWT auth and a database schema, push the initial commit, and open issues for the billing and PDF export features"*

Done. Repo created, code pushed, issues filed — without touching a laptop.

**Close the loop from idea to pull request.**

> *"Look at the open issues in my main repo, pick the highest-priority bug, implement a fix, run the tests, and open a PR with a clear description"*

The agent reads the repo, writes the code, references the issue, links the PR.

**Cross-repo and org-wide context.**

> *"Find all repos in my org that still use an end-of-life runtime, summarize what each service does, and draft upgrade issues for each one"*

**PR reviews from anywhere.**

> *"Summarize what this PR changes, flag any security concerns in the diff, and draft inline review comments on the riskiest lines"*

Read that on your commute. Reply, approve, or request changes — without opening VS Code.

**The difference from other AI tools:** ChatGPT, Claude, and Gemini all work *with* GitHub — you paste in code, you copy out diffs. This works *as* GitHub — the agent creates branches, pushes commits, files PRs, and responds to CI feedback natively, the same way the Copilot CLI does from your terminal, but accessible on any device.

---

## Run it

You need a [GitHub account with Copilot](https://github.com/features/copilot#pricing) (free tier works) and a [GitHub OAuth App](https://github.com/settings/developers) (30 seconds — just copy the Client ID).

**Docker** (recommended):

```bash
echo "GITHUB_CLIENT_ID=<your-id>" >> .env
echo "SESSION_SECRET=$(openssl rand -hex 32)" >> .env
docker compose up --build
```

**Node.js 24+:**

```bash
npm install && npm run build && npm start
```

Open [localhost:3000](http://localhost:3000). Log in with GitHub. Done.

---

## Deploy to Azure

```bash
azd up
```

That's it. Container Apps, ACR (Basic), Key Vault, managed identity, Log Analytics, and TLS — all provisioned automatically.

### Required parameters

`azd up` will prompt for these if not already set:

| Parameter | How to set | Notes |
|-----------|-----------|-------|
| `GITHUB_CLIENT_ID` | `azd env set GITHUB_CLIENT_ID <id>` | Your GitHub OAuth App client ID |
| `SESSION_SECRET` | auto-generated as `newGuid()` if omitted | 32+ char random string |

### Deployer IP (required for ACR push access)

The infrastructure uses a **Basic SKU ACR** with a deployer IP allowlist for push access. Set your current public IP before deploying:

```bash
azd env set DEPLOYER_IP_ADDRESS "$(curl -s https://api.ipify.org)"
azd up
```

The ACR firewall will allow only that IP for push operations. Container Apps pull images via managed identity. For CI/CD pipelines, set `DEPLOYER_IP_ADDRESS` to the runner's outbound IP in the same way.

### Optional: VAPID keys for push notifications

```bash
node scripts/generate-vapid-keys.mjs
azd env set VAPID_PUBLIC_KEY  "<key>"
azd env set VAPID_PRIVATE_KEY "<key>"
azd env set VAPID_SUBJECT     "mailto:you@example.com"
```

### Bootstrapping secrets in Key Vault

`azd provision` stores `GITHUB_CLIENT_ID`, `SESSION_SECRET`, and (optionally) VAPID keys as secrets in Azure Key Vault. The Container App reads them at runtime via the managed identity — no secrets in environment variables or container image.

### Troubleshooting `azd up`

<details>
<summary>Container App fails with MANIFEST_UNKNOWN image tag</summary>

If provisioning fails mid-run, the `.azure/<env>/.env` may hold a stale `SERVICE_WEB_IMAGE_NAME` pointing to a tag that no longer exists in a newly-recreated ACR. Clear it before retrying:

```bash
azd env set SERVICE_WEB_IMAGE_NAME ""
azd up
```

`azd provision` will deploy with the placeholder image; `azd deploy` pushes the real image immediately after.

</details>

<details>
<summary>ACR push fails with 403 Forbidden / IP not allowed</summary>

Set your public IP and re-provision to open the ACR firewall:

```bash
azd env set DEPLOYER_IP_ADDRESS "$(curl -s https://api.ipify.org)"
azd provision   # updates ACR network rules
azd deploy      # push succeeds
```

</details>

<details>
<summary>Container App fails: unable to fetch secret from Key Vault</summary>

This means the Key Vault secret doesn't exist yet (typically on a fresh deploy). Ensure `GITHUB_CLIENT_ID` is set and run `azd provision` again — it will create the secrets in Key Vault as part of infra creation.

```bash
azd env set GITHUB_CLIENT_ID "<your-id>"
azd provision
```

</details>

---

## Config

| Variable | Required | Default | What it does |
|----------|:--------:|---------|-------------|
| `GITHUB_CLIENT_ID` | yes | — | OAuth App client ID |
| `SESSION_SECRET` | yes | — | Cookie encryption key |
| `PORT` | — | `3000` | Server port |
| `ALLOWED_GITHUB_USERS` | — | — | Restrict access to specific users |
| `BASE_URL` | — | `http://localhost:3000` | Cookie domain + WS origin check |
| `GITHUB_REPO` | — | — | Optional `owner/repo` scope for issue search |

<details>
<summary>All options</summary>

| Variable | Default | What it does |
|----------|---------|-------------|
| `NODE_ENV` | `development` | `production` enables secure cookies |
| `TOKEN_MAX_AGE_MS` | `86400000` | Force re-auth interval (24h) |
| `SESSION_POOL_TTL_MS` | `300000` | Session TTL when disconnected (5 min) |
| `MAX_SESSIONS_PER_USER` | `5` | Max concurrent tabs/devices per user (evicts oldest when exceeded) |
| `SESSION_STORE_PATH` | `/data/sessions` | Persistent session directory |
| `SETTINGS_STORE_PATH` | `/data/settings` | Per-user settings directory |
| `COPILOT_CONFIG_DIR` | `~/.copilot` | Copilot session-state directory (share with CLI for bidirectional sync) |
| `CHAT_STATE_PATH` | `.chat-state` (dev) / `/data/chat-state` (prod) | Persisted chat state storage |
| `VAPID_PUBLIC_KEY` | — | VAPID public key (base64url) — required for push notifications |
| `VAPID_PRIVATE_KEY` | — | VAPID private key (base64url) — required for push notifications |
| `VAPID_SUBJECT` | `mailto:admin@example.com` | VAPID subject identifier |
| `PUSH_STORE_PATH` | `/data/push-subscriptions` | Push subscription storage path |

</details>

### Generate VAPID keys (for push notifications)

```bash
node scripts/generate-vapid-keys.mjs
```

Copy the output into your `.env` file. Push notifications require all three VAPID variables (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`).

---

## CLI ↔ Browser session sync

Copilot Unleashed and the GitHub Copilot CLI share the same session-state directory (`~/.copilot/session-state/`). By default, the app reads from the same location the CLI uses — so any session started in the terminal is available in the browser the moment you open the Sessions panel.

> **Note:** When running via Docker (`npm run dev`), the `docker-compose.yml` mounts `~/.copilot` read-only into the container.

### How it works

The `@github/copilot-sdk` stores each session as a folder on disk:

```
~/.copilot/session-state/{session-uuid}/
  workspace.yaml       ← project metadata (cwd, repo, branch, summary)
  plan.md              ← living task list updated as the agent works
  checkpoints/
    index.md           ← checkpoint table of contents
    001_*.md           ← compressed conversation snapshots
    002_*.md
    …
```

When you resume a session from the browser, the SDK's native `resumeSession()` restores the full conversation history and checkpoint context automatically. If the session is only available on disk (e.g. bundled into a Docker image without an active SDK index), the app falls back to reading `workspace.yaml`, `plan.md`, and the last three checkpoint files directly and injecting them as context into a new session — so nothing is lost.

### Bidirectional plan sync

Plan changes flow in both directions between the CLI and the browser:

- **CLI → Browser**: When you resume a session, the filesystem `plan.md` is injected into the agent's context as a system message, so the agent knows the current plan even if it was last modified in the terminal.
- **Browser → CLI**: When the agent updates the plan during a browser session, the change is automatically written back to `plan.md` on disk. The next time you run `copilot resume` in the terminal, the CLI picks up the latest plan.

This sync is always active and requires no configuration — as long as the CLI and Copilot Unleashed share the same `~/.copilot/session-state/` directory (which is the default when running locally). In Docker, you need a bind-mount to enable it (see below).

### Sessions panel

The Sessions panel (bottom-left icon) lets you:

- Browse all sessions grouped by repository
- See metadata badges — branch, checkpoint count, plan indicator
- Preview a session before resuming: checkpoint timeline, full `plan.md` content, project path
- Search and filter by title, repository, branch, or directory
- Resume any session with one tap, on any device

### Custom session-state directory

If you want to use a separate directory (e.g. a shared network path or a custom mount in Docker):

```bash
COPILOT_CONFIG_DIR=/data/copilot-state
```

The CLI and Copilot Unleashed will read from and write to the same path. Sessions started in either interface appear in both.

### Docker / Azure deployment

When deploying to a container, you have several options for session availability:

**Option 1: Bind-mount (Docker Compose, local development)**

```yaml
# docker-compose.yml
volumes:
  - ~/.copilot:/home/node/.copilot        # read-write: full bidirectional sync
```

**Option 2: Bundle sessions at build time (Azure / CI)**

Run `npm run bundle-sessions` before building the Docker image. This snapshots your local CLI sessions into the image. When deploying with `azd up`, this happens automatically via the `predeploy` hook in `azure.yaml`.

```bash
npm run bundle-sessions   # snapshots ~/.copilot sessions into bundled-sessions/
azd up                    # auto-runs bundle-sessions before docker build
```

> **Note:** CI/CD builds (GitHub Actions) won't include your local sessions since `~/.copilot` isn't available in the runner. Use `azd up` locally or push sessions on-demand (below).

**Option 3: Push sessions on-demand to a running instance**

After deploying, push new sessions without redeploying:

```bash
npm run sync:push -- https://your-app.azurecontainerapps.io
```

This computes a delta (sessions in local `~/.copilot` but not on remote) and uploads only the new or updated ones. It authenticates using your GitHub token (`gh auth token` or `GH_TOKEN` env var). The remote instance must have `ALLOWED_GITHUB_USERS` set to include your username.

The sync API (`GET/POST /api/sessions/sync`) is also available programmatically for custom automation.

### Auto-refresh

The Sessions panel auto-refreshes every 30 seconds while open, so CLI sessions created in a parallel terminal appear in the browser without manual reload.

---

## How it works

```
Browser ──WebSocket──▶ SvelteKit + server.js ──JSON-RPC──▶ Copilot SDK subprocess
```

1. GitHub Device Flow login → token stored server-side only
2. WebSocket opens → server spawns a `CopilotClient` per user
3. SDK streams events → server forwards as typed JSON → Svelte re-renders in real-time
4. On disconnect → session pooled with TTL, reconnect replays messages

[Architecture docs →](docs/ARCHITECTURE.md)

---

## Auth & Security

Device Flow OAuth (same as GitHub CLI). No client secret needed. Tokens are server-side only, never sent to the browser. Sessions are encrypted, rate-limited, and validated against GitHub's API on every WebSocket connect.

Scopes: `copilot` (API access) + `read:user` (avatar) + `repo` (SDK tools need it — same as the CLI).

<details>
<summary>Full security details</summary>

- CSP headers, CSRF protection, HSTS, X-Frame-Options DENY
- Rate limiting: 200 req / 15 min per IP (HTTP) + 30 msg / min per WebSocket connection
- Secure cookies: httpOnly, secure (prod), sameSite: lax
- DOMPurify on all rendered markdown
- SSRF blocklist for custom webhook and MCP server URLs (IPv4 + IPv6 internal ranges, HTTPS required)
- 10,000 char message limit, 10MB upload limit, extension allowlist
- Per-tool permission prompts with 30s auto-deny countdown
- Token revalidation on every WebSocket connect
- Structured security event logging
- Optional user allowlist via `ALLOWED_GITHUB_USERS`
- CodeQL scanning + secret scanning via GitHub Advanced Security
- All API endpoints require GitHub authentication — no anonymous access
- Periodic token revalidation ensures revoked tokens are caught promptly
- **Azure**: Key Vault (RBAC-only) for secrets management, Basic ACR with deployer IP allowlist, managed identity for registry pull

</details>

---

## Data Persistence

All stateful data survives container restarts when volumes are configured correctly.

| Data | Path (default) | Survives restart? |
|------|----------------|:-:|
| SDK sessions & checkpoints | `COPILOT_CONFIG_DIR` (`~/.copilot`) | ✅ with volume |
| App session metadata | `SESSION_STORE_PATH` (`/data/sessions`) | ✅ with volume |
| Per-user settings | `SETTINGS_STORE_PATH` (`/data/settings`) | ✅ with volume |
| Chat history | `CHAT_STATE_PATH` (`/data/chat-state`) | ✅ with volume |
| Push subscriptions | `PUSH_STORE_PATH` (`/data/push-subscriptions`) | ✅ with volume |

**Local Docker:** Use a named volume for `/data` and a bind mount for `~/.copilot` (enables CLI ↔ Browser sync).

```yaml
# docker-compose.yml
volumes:
  - app-data:/data                          # sessions, settings, chat state, push subs
  - ~/.copilot:/home/node/.copilot          # SDK session-state (shared with CLI)
```

**Azure Container Apps:** Uses an EmptyDir volume at `/data`. Data survives container restarts but **not** replica replacement or scaling events. The Bicep infrastructure provisions this automatically via `azd up`.

---

## Built with

SvelteKit 5 · Svelte 5 runes · TypeScript 5.7 · Node.js 24 · `@github/copilot-sdk` · Vite · `ws` · Vitest · Playwright · Docker · Bicep

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
