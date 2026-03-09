# Copilot CLI Mobile

> **GitHub Copilot CLI from your phone** — a lightweight, self-hosted web app powered by the official [GitHub Copilot SDK](https://github.com/github/copilot-sdk).

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-24-339933?logo=nodedotjs&logoColor=white" alt="Node.js 24">
  <img src="https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Copilot_SDK-%5E0.1.32-000000?logo=github&logoColor=white" alt="Copilot SDK">
  <img src="https://img.shields.io/badge/License-MIT-green" alt="MIT License">
</p>

---

## What Is This?

The same Copilot CLI experience you get on your terminal — but accessible from a mobile browser. Authenticate with GitHub, pick a model, and start chatting. The app uses the official `@github/copilot-sdk` under the hood, so it has full parity with the desktop Copilot CLI — including built-in tools for the GitHub API, file access, and shell.

## Copilot SDK Implementation

The core of the app is a thin WebSocket layer on top of `@github/copilot-sdk`. Each browser connection gets its own SDK lifecycle:

1. **Client per connection** — `CopilotClient` is instantiated per WebSocket connection. The SDK spawns a `@github/copilot` CLI subprocess behind the scenes, communicating via JSON-RPC over stdio.

2. **Session management** — On connect (or "new chat"), the server calls `client.createSession()` with a `SessionConfig` object that includes the selected model, reasoning effort, custom instructions, the GitHub MCP server, and the permission handler.

3. **Streaming events** — The SDK session emits events (`assistant.message_delta`, `assistant.reasoning_delta`, `tool.execution_start`, etc.) which the server forwards over WebSocket as typed JSON messages. The browser renders them in real time.

4. **Lifecycle cleanup** — On WebSocket close, the server destroys the session and calls `client.stop()` to terminate the CLI subprocess.

### SDK Features Implemented

| SDK Feature | API Used | How It's Exposed |
|-------------|----------|-------------------|
| **Model selection** | `SessionConfig.model` + `client.listModels()` | Dropdown in the status bar. Populated dynamically from the Copilot API. Mid-session model switching via `session.setModel()` |
| **Reasoning effort** | `SessionConfig.reasoningEffort` (`low` / `medium` / `high` / `xhigh`) | Toggle button group, visible only for reasoning-capable models (o-series, thinking). Changing it restarts the session |
| **Streaming** | `SessionConfig.streaming: true` + `assistant.message_delta` events | Token-by-token rendering with a typing cursor. Throttled at 50ms for smooth mobile performance |
| **Extended thinking** | `assistant.reasoning_delta` / `assistant.reasoning` events | Collapsible "Thinking…" block with live content. Auto-collapses when reasoning is done |
| **Modes** | `session.rpc.mode.set()` — `interactive` / `plan` / `autopilot` | Three-button toggle (ask / plan / auto) matching the CLI's `/mode` command |
| **Custom instructions** | `SessionConfig.systemMessage` in `append` mode | Textarea in the Settings panel. Instructions are appended to the SDK's system prompt without replacing security guardrails |
| **MCP Server** | `SessionConfig.mcpServers` — GitHub HTTP MCP with `tools: ['*']` | All GitHub MCP tools available (readonly). Authenticated with the user's GitHub token |
| **Permission handling** | `SessionConfig.onPermissionRequest: approveAll` | Auto-approves all tool calls, matching the desktop CLI's default behavior |
| **User input requests** | `SessionConfig.onUserInputRequest` callback returning a Promise | Interactive UI with choice buttons + freeform text input. The SDK's `ask_user` tool triggers a prompt in the chat |
| **Tool execution lifecycle** | `tool.execution_start` / `tool.execution_progress` / `tool.execution_complete` | Spinner animation with tool name and progress text. Checkmark on completion |
| **Intent display** | `assistant.intent` event | Arrow (→) line showing the model's inferred intent before acting |
| **Token usage** | `assistant.usage` event | Info line after each response: `tokens — in: X · out: Y · reasoning: Z` |
| **Session title** | `session.title_changed` event | Displayed as an info line below the environment section |
| **Subagent orchestration** | `subagent.started` / `subagent.completed` events | Tool-style display: `agent/<name>` with spinner and status |
| **Session warnings/errors** | `session.warning` / `session.error` events | Yellow/red styled messages in the chat |
| **Abort** | `session.abort()` | Stop button (visible during streaming) sends abort to the SDK |

### SDK Features Not Used

| SDK Feature | Why Not |
|-------------|---------|
| `provider` (BYOK) | This app targets users with a Copilot license — custom providers are out of scope |

| `systemMessage: { mode: 'replace' }` | Only `append` mode is used to preserve SDK safety guardrails |
| `hooks` (`onPreToolUse`, `onPostToolUse`, etc.) | Not needed — `approveAll` covers the permission model |
| `customAgents` / `skillDirectories` | Desktop-only features that require local filesystem access |
| `infiniteSessions` | Default SDK behavior (auto-compaction) is used as-is |
| `workingDirectory` / `configDir` | The app runs in a container; no user workspace to reference |

## Features

| Feature | Description |
|---------|-------------|
| **Full Copilot CLI parity** | Same engine, same models, same tools as `copilot` in your terminal |
| **Mobile-first UI** | Dark theme, responsive layout, virtual keyboard handling, touch-optimized controls |
| **Real-time streaming** | Token-by-token responses over WebSocket with typing indicator |
| **GitHub Device Flow auth** | Same auth as `gh auth login` — enter a short code, no client secret needed |
| **Settings persistence** | Model, mode, reasoning effort, and custom instructions saved in localStorage |
| **Settings panel** | Custom instructions (appended to system prompt), preference persistence |
| **Markdown rendering** | Full GFM support with syntax-highlighted code blocks and copy buttons |
| **Docker-ready** | Single `docker compose up` to run locally |
| **2 env vars** | Only `SESSION_SECRET` and `GITHUB_CLIENT_ID` required |

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Mobile / Desktop Browser                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────────────────┐   │
│  │  Device Flow UI  │  │   Chat UI (SPA) │  │  Markdown + Highlight   │   │
│  │  (login screen)  │  │  (chat screen)  │  │  (marked + DOMPurify)   │   │
│  └────────┬─────────┘  └───────┬─────────┘  └──────────────────────────┘   │
│           │ HTTP                │ WebSocket (ws/wss)                       │
└───────────┼────────────────────┼──────────────────────────────────────────┘
            │                    │
            ▼                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     Express + TypeScript Server                           │
│  ┌──────────┐  ┌──────────┐  ┌─────────────┐  ┌────────────────────────┐  │
│  │  Helmet   │  │  Rate    │  │  Session    │  │  Static File Server   │  │
│  │  (CSP)    │  │  Limiter │  │  (file/mem) │  │  (public/)            │  │
│  └──────────┘  └──────────┘  └──────┬──────┘  └────────────────────────┘  │
│                                     │                                     │
│  ┌──────────────────────────────────┼──────────────────────────────────┐  │
│  │  Routes                          │                                  │  │
│  │  /auth/* ─── Device Flow ────────┤                                  │  │
│  │  /api/*  ─── Models (guarded) ───┤                                  │  │
│  │  /ws     ─── WebSocket ──────────┘                                  │  │
│  └──────────────────────────────────┬──────────────────────────────────┘  │
│                                     │                                     │
│  ┌──────────────────────────────────┴──────────────────────────────────┐  │
│  │  Copilot SDK                                                        │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌────────────────────┐  │  │
│  │  │  CopilotClient   │  │  Session +       │  │  MCP GitHub       │  │  │
│  │  │  (per connection) │  │  Model Config    │  │  HTTP Server      │  │  │
│  │  └────────┬─────────┘  └─────────────────┘  └────────────────────┘  │  │
│  │           │ JSON-RPC (stdio)                                        │  │
│  │           ▼                                                         │  │
│  │  ┌─────────────────┐                                                │  │
│  │  │  @github/copilot │ ← CLI subprocess (one per connection)         │  │
│  │  │  CLI process      │                                               │  │
│  │  └─────────────────┘                                                │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
            │
            ▼
┌──────────────────────────┐
│  github.com              │
│  ├─ Device Flow OAuth    │
│  ├─ Copilot API          │
│  └─ REST API (via MCP)   │
└──────────────────────────┘
```

**How it works:**

1. User opens the app → GitHub Device Flow starts (enter a code at `github.com/login/device`)
2. After auth → GitHub token stored server-side in Express session (never sent to browser)
3. Chat screen appears — user picks a model, WebSocket connection opens
4. Server creates a `CopilotClient` per WebSocket connection (the SDK spawns a `@github/copilot` CLI subprocess communicating via JSON-RPC over stdio)
5. A `SessionConfig` is built with the selected model, reasoning effort, custom instructions (`systemMessage: append`), the GitHub MCP server, and `approveAll` as the permission handler
6. `client.createSession(config)` starts the session — the server subscribes to all SDK events (`assistant.message_delta`, `tool.execution_start`, `assistant.reasoning_delta`, `session.title_changed`, etc.)
7. User sends a message → server calls `session.sendAndWait({ prompt })` → SDK emits events → each event is forwarded over WebSocket as typed JSON → browser renders in real time
8. On disconnect → `session.destroy()` + `client.stop()` terminates the CLI subprocess

## Getting Started

### Prerequisites

- **GitHub account** with an active [Copilot license](https://github.com/features/copilot#pricing) (free tier works)
- **GitHub OAuth App** — register one in ~30 seconds (see below)

### Register a GitHub OAuth App

The app uses [GitHub Device Authorization Flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow) — the same flow as `gh auth login`. **No client secret needed.**

1. Go to [GitHub → Settings → Developer settings → OAuth Apps](https://github.com/settings/developers)
2. Click **New OAuth App**:
   - **Application name**: `Copilot CLI Mobile`
   - **Homepage URL**: `http://localhost:3000`
   - **Authorization callback URL**: `http://localhost:3000` (device flow never uses it)
3. Click **Register application**
4. Copy the **Client ID** → that's your `GITHUB_CLIENT_ID`

> No client secret, no redirect URI configuration, and no updates needed when the URL changes.

---

### Try It — GitHub Codespaces

The fastest way to try the app. Runs entirely in the browser — no local setup needed.

1. **Add your `GITHUB_CLIENT_ID` as a Codespace secret** at [github.com/settings/codespaces](https://github.com/settings/codespaces) (scope it to this repo)
2. Click the button below to launch:

   [![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/devartifex/copilot-cli-mobile?quickstart=1)

3. The Codespace installs dependencies, generates a `SESSION_SECRET`, builds the app, and opens it in your browser automatically.

---

### Run Locally

<details>
<summary><strong>Docker (recommended)</strong></summary>

Create a `.env` file:

```env
GITHUB_CLIENT_ID=<your-client-id>
SESSION_SECRET=<run: openssl rand -hex 32>
```

```bash
docker compose up --build
```

Open [http://localhost:3000](http://localhost:3000) — enter the code on GitHub, and start chatting.

</details>

<details>
<summary><strong>Node.js (without Docker)</strong></summary>

Requires **Node.js 24+** (the Copilot CLI needs `node:sqlite` built into Node 24).

Create a `.env` file:

```env
GITHUB_CLIENT_ID=<your-client-id>
SESSION_SECRET=<run: openssl rand -hex 32>
```

```bash
npm install
npm run build
npm start
```

Or for development with hot reload:

```bash
npm run dev:local
```

</details>

## Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GITHUB_CLIENT_ID` | Yes | — | GitHub OAuth App client ID |
| `SESSION_SECRET` | Yes* | — | Random string for session encryption (`openssl rand -hex 32`). Auto-generated on Azure deploy. |
| `PORT` | No | `3000` | HTTP server port |
| `BASE_URL` | No | `http://localhost:3000` | Full app URL (used for cookies + WebSocket origin validation) |
| `NODE_ENV` | No | `development` | Set to `production` for secure cookies + trust proxy |
| `SESSION_STORE_PATH` | No | `.sessions` | Directory for file-based session store (dev only) |
| `ALLOWED_GITHUB_USERS` | No | — | Comma-separated GitHub usernames allowed to log in |
| `TOKEN_MAX_AGE_MS` | No | `86400000` (24h) | Force re-auth after this many milliseconds |

## Security

- **Server-side token storage** — GitHub token is stored in the Express session, never sent to the browser
- **Security headers** — Helmet sets CSP, HSTS, X-Frame-Options, X-Content-Type-Options, frame-ancestors none
- **Rate limiting** — per-IP request throttling (200 req / 15 min)
- **Secure cookies** — `httpOnly`, `secure` (in production), `sameSite: lax`, 30-day rolling
- **Session fixation protection** — `session.regenerate()` after GitHub auth
- **Token freshness** — tokens expire after 24 hours (configurable via `TOKEN_MAX_AGE_MS`)
- **Token revalidation** — WebSocket connections validate the GitHub token against GitHub's API on connect (catches revoked tokens)
- **Origin validation** — WebSocket connections are validated against the configured `BASE_URL` in production
- **User allowlist** — optional `ALLOWED_GITHUB_USERS` restricts who can log in
- **Input limits** — Messages capped at 10,000 chars; custom instructions at 2,000 chars (server-enforced)
- **XSS prevention** — All rendered markdown sanitized through DOMPurify; CDN scripts use Subresource Integrity (SRI) hashes
- **System prompt safety** — Custom instructions use `append` mode only, preserving SDK security guardrails
- **Full Copilot CLI parity** — SDK built-in tools (GitHub API, file access, shell) are approved via `approveAll`, matching the desktop CLI
- **Infrastructure secrets** (Azure) — Secrets stored natively in Container Apps (encrypted at rest); managed identity for registry pull; CORS policy restricts origins; optional IP restrictions via Bicep params

## Project Structure

```
copilot-cli-mobile/
├── src/
│   ├── index.ts              # Entry point — HTTP server + WebSocket setup
│   ├── config.ts             # Env var validation (fail-fast on missing)
│   ├── server.ts             # Express app, middleware stack, routes
│   ├── security-log.ts       # Structured security event logging
│   ├── auth/
│   │   ├── github.ts         # GitHub Device Flow OAuth (fetch-based)
│   │   └── middleware.ts     # requireGitHub session guard + token freshness check
│   ├── copilot/
│   │   ├── client.ts         # CopilotClient factory (one per WS connection)
│   │   └── session.ts        # SessionConfig builder — model, reasoning, MCP, custom instructions
│   ├── routes/
│   │   ├── auth.ts           # /auth/* (device/start, device/poll, logout, status)
│   │   └── api.ts            # /api/* (models, version, client-error) — behind requireGitHub
│   ├── ws/
│   │   └── handler.ts        # WebSocket handler — message routing, SDK event forwarding, token revalidation
│   └── types/
│       └── session.d.ts      # Express session type augmentation
├── public/
│   ├── index.html            # SPA shell (login screen + chat screen + settings panel)
│   ├── css/
│   │   ├── style.css         # Dark theme, mobile-first, CSS custom properties
│   │   └── github-dark.min.css # Syntax highlighting theme
│   └── js/
│       ├── app.js            # App init, auth orchestration, settings panel wiring
│       ├── auth.js           # Device flow API client
│       └── chat.js           # WebSocket client, markdown rendering, streaming, localStorage persistence
├── .devcontainer/            # GitHub Codespaces configuration
├── infra/                    # Azure Bicep IaC (Container Apps, ACR, Managed Identity, monitoring)
├── .github/workflows/        # CI (lint + build) + CD (Docker → ACR → Container Apps)
├── Dockerfile                # Multi-stage build (Node 24 + Copilot CLI)
├── docker-compose.yml        # Local development with volume mounts
├── package.json
└── tsconfig.json
```

### WebSocket Message Protocol

Messages between client and server use typed JSON. Here's the full protocol:

**Client → Server:**

| Message Type | Purpose |
|------------|---------|
| `new_session` | Create a session with `{ model, reasoningEffort?, customInstructions?, excludedTools? }` |
| `message` | Send user prompt `{ content }` (max 10,000 chars) |
| `list_models` | Request available models from Copilot API |
| `set_mode` | Switch mode: `interactive`, `plan`, or `autopilot` |
| `set_model` | Change model mid-session |
| `set_reasoning` | Update reasoning effort for next session |
| `abort` | Cancel the current streaming response |
| `user_input_response` | Reply to an SDK `ask_user` tool prompt |
| `list_tools` | List available tools in the current session |
| `list_agents` | List available subagents |
| `select_agent` / `deselect_agent` | Select or deselect a subagent |
| `get_quota` | Get remaining quota/usage info |
| `compact` | Manually trigger context compaction |
| `list_sessions` / `resume_session` | List or resume previous sessions |
| `get_plan` / `update_plan` / `delete_plan` | Manage plan mode plans |

**Server → Client:**

| Message Type | SDK Event Source | Purpose |
|------------|------------------|---------|
| `connected` | — | Connection established, includes GitHub username |
| `session_created` | — | Session ready, input enabled |
| `delta` | `assistant.message_delta` | Streamed token chunk |
| `reasoning_delta` | `assistant.reasoning_delta` | Extended thinking chunk |
| `reasoning_done` | `assistant.reasoning` | Reasoning block complete |
| `intent` | `assistant.intent` | Model's inferred intent |
| `turn_start` / `turn_end` | `assistant.turn_start/end` | Turn lifecycle |
| `tool_start` | `tool.execution_start` | Tool execution begins (name, MCP server) |
| `tool_progress` | `tool.execution_progress` | Tool status update |
| `tool_end` | `tool.execution_complete` | Tool finished |
| `mode_changed` | `session.mode_changed` | Mode switch confirmed |
| `model_changed` | — | Model switch confirmed |
| `title_changed` | `session.title_changed` | Auto-generated session title |
| `usage` | `assistant.usage` | Token counts (input, output, reasoning) |
| `warning` | `session.warning` | Session warning |
| `error` | `session.error` | Error message |
| `subagent_start/end` | `subagent.started/completed` | Subagent lifecycle |
| `subagent_failed` | `subagent.failed` | Subagent error |
| `subagent_selected/deselected` | `subagent.selected/deselected` | Subagent selection state |
| `skill_invoked` | `skill.invoked` | Skill invocation |
| `compaction_start` | `session.compaction_start` | Context compaction started |
| `compaction_complete` | `session.compaction_complete` | Compaction done (tokens/messages removed) |
| `plan_changed` | `session.plan_changed` | Plan content updated |
| `info` | `session.info` | Informational message |
| `elicitation_requested` | `elicitation.requested` | SDK asks user for input/choice |
| `elicitation_completed` | `elicitation.completed` | Elicitation answered |
| `user_input_request` | `onUserInputRequest` callback | SDK asks user for input/choice |
| `models` | `client.listModels()` | Available model list |
| `done` | — | Response complete, input re-enabled |
| `aborted` | — | Response cancelled |

## Deploy to Azure

<details>
<summary><strong>Production deployment with Azure Container Apps</strong></summary>

### Prerequisites

- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) installed and authenticated (`az login`)
- [Azure Developer CLI](https://learn.microsoft.com/azure/developer/azure-developer-cli/install-azd) (`azd`)

### Deploy with `azd up`

```bash
az login
azd auth login

# Set your GitHub OAuth App client ID
azd env set GITHUB_CLIENT_ID <your-github-client-id>

# Optional: restrict to specific GitHub users
azd env set allowedGithubUsers "your-username,teammate"

# Optional: restrict to specific IP ranges (CIDR notation)
azd env set ipRestrictions "203.0.113.0/24"

# Provision + build + deploy
azd up
```

This provisions:

| Resource | Purpose |
|----------|---------|
| **Container Registry** | Docker image storage |
| **Container App** | Serverless container runtime (port 3000, auto-TLS, CORS) |
| **Managed Identity** | RBAC for ACR pull (no stored credentials) |
| **Log Analytics + App Insights** | Monitoring and diagnostics |

`SESSION_SECRET` is auto-generated during provisioning. All secrets are stored natively in Container Apps (encrypted at rest).

### Subsequent deploys

```bash
azd deploy    # Redeploy without re-provisioning infrastructure
```

### CI/CD with GitHub Actions

Create a service principal scoped to your resource group:

```bash
az ad sp create-for-rbac \
  --name "copilot-cli-mobile-cicd" \
  --role contributor \
  --scopes /subscriptions/<subscription-id>/resourceGroups/<resource-group> \
  --sdk-auth
```

Add these secrets in **GitHub → Settings → Secrets → Actions**:

| Secret | Value |
|--------|-------|
| `AZURE_CREDENTIALS` | Full JSON output from the command above |
| `ACR_LOGIN_SERVER` | `<registry-name>.azurecr.io` |
| `ACR_NAME` | Container Registry name |
| `AZURE_RESOURCE_GROUP` | Resource Group name |

- **CI** (`ci.yml`): Runs on every push — type-checks and builds
- **Deploy** (`deploy.yml`): Runs on push to `main` — builds Docker image, pushes to ACR, deploys to Container Apps

### Troubleshooting

**Container App not starting** — check logs:

```bash
az containerapp logs show \
  --name copilot-cli-mobile \
  --resource-group <resource-group> \
  --type console
```

</details>

## License

MIT
