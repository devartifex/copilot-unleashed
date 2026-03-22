# Architecture

> Copilot Unleashed — SvelteKit 5 full-stack architecture

## High-Level Overview

```
Browser (Svelte 5 SPA)
    │
    ├── SSR ──────────▶ SvelteKit Server (adapter-node)
    │                       │
    ├── WebSocket ──────────┤── JSON-RPC ──▶ @github/copilot CLI subprocess
    │                       │                      │
    │  Device Flow auth     │  Session pool        │  Copilot API
    │  Rune-based stores    │  SDK event wiring    │  GitHub MCP tools
    │  Component rendering  │  Permission hooks    │  File access, shell
    ▼                       ▼                      ▼
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 24 (node:24-slim in Docker) |
| Language | TypeScript 5.7 (strict mode, ES2022) |
| Framework | SvelteKit 5 with `adapter-node` |
| Reactivity | Svelte 5 runes ($state, $derived, $effect, $props) |
| AI Engine | `@github/copilot-sdk` ^0.1.32 |
| Real-time | WebSocket (`ws` ^8.18) via custom `server.js` entry |
| Markdown | `marked` + `dompurify` + `highlight.js` |
| Security | Custom CSP/HSTS headers in hooks.server.ts, rate limiting, DOMPurify |
| Sessions | express-session bridged to SvelteKit via `x-session-id` header |
| Build | Vite → `build/` via adapter-node |
| Container | Multi-stage Dockerfile (builder + runtime) |
| IaC | Bicep (Container Apps, ACR Basic, Key Vault RBAC, Managed Identity, Log Analytics) |
| CI/CD | GitHub Actions (ci.yml + deploy.yml) |
| Testing | Playwright (desktop + mobile viewports) |

## Project Structure

```
src/
├── app.html                    # SvelteKit shell (meta tags, viewport, theme)
├── app.css                     # Global CSS reset, design tokens, highlight.js theme
├── app.d.ts                    # TypeScript ambient declarations
├── hooks.server.ts             # Server hooks: session bridge, CSP, rate limiting
│
├── lib/
│   ├── components/             # 20 Svelte 5 components
│   │   ├── Banner.svelte           # Welcome banner with Copilot icon
│   │   ├── ChatInput.svelte        # Auto-expanding textarea, file attachments, status bar
│   │   ├── ChatMessage.svelte      # Message renderer (10 roles: user, assistant, tool, etc.)
│   │   ├── CustomToolsEditor.svelte # Webhook tool CRUD editor
│   │   ├── DeviceFlowLogin.svelte  # GitHub Device Flow auth UI
│   │   ├── EnvInfo.svelte          # Environment info (models, tools, context usage)
│   │   ├── MessageList.svelte      # Scrollable message container with smart auto-scroll
│   │   ├── PermissionPrompt.svelte # Tool permission request with countdown
│   │   ├── PlanPanel.svelte        # Collapsible plan viewer/editor
│   │   ├── QuotaDot.svelte         # Color-coded quota indicator
│   │   ├── ReasoningBlock.svelte   # Collapsible "Thinking..." block with shimmer
│   │   ├── SessionsSheet.svelte    # Bottom sheet for session history
│   │   ├── SettingsModal.svelte    # Accordion settings (instructions, tools, agents, quota)
│   │   ├── Sidebar.svelte          # Slide-out menu (mode, model, reasoning, actions)
│   │   ├── ToolCall.svelte         # Animated tool execution with Braille spinner
│   │   └── UserInputPrompt.svelte  # Elicitation UI (choices + freeform)
│   │
│   ├── stores/                 # Svelte 5 rune stores (factory functions)
│   │   ├── auth.svelte.ts          # Auth state, device flow polling, countdown
│   │   ├── chat.svelte.ts          # Messages, streaming, tools, models, plan, quota
│   │   ├── settings.svelte.ts      # Persisted settings (localStorage)
│   │   └── ws.svelte.ts            # WebSocket connection, typed send helpers
│   │
│   ├── server/                 # Server-only code (not bundled to client)
│   │   ├── auth/
│   │   │   ├── github.ts              # Device Flow OAuth (fetch-based)
│   │   │   └── guard.ts               # Auth middleware + 30-min token revalidation
│   │   ├── copilot/
│   │   │   ├── client.ts              # CopilotClient factory
│   │   │   └── session.ts             # Session config (model, reasoning, tools, hooks)
│   │   ├── ws/
│   │   │   ├── handler.ts             # WebSocket handler: 22+ message types, SDK events
│   │   │   └── session-pool.ts        # Per-user session pool with TTL + buffer
│   │   ├── push/
│   │   │   ├── subscription-store.ts  # Push subscription CRUD per user (10 sub cap)
│   │   │   └── sender.ts             # web-push wrapper with 60-min TTL, auto-cleanup
│   │   ├── chat-state-store.ts        # Persistent chat state per user+tab (1000-msg cap, atomic writes)
│   │   ├── session-watcher.ts         # fs.watch on session-state dir, 100ms debounce
│   │   ├── init.ts                    # Server-side initialization (watcher + signal handlers)
│   │   ├── config.ts                  # Env var validation (fail-fast)
│   │   ├── security-log.ts            # Structured security event logging
│   │   └── session-store.ts           # Express session ↔ SvelteKit bridge
│   │
│   ├── types/
│   │   └── index.ts            # All types: server messages, client messages, state
│   │
│   └── utils/
│       ├── markdown.ts         # renderMarkdown, highlightCodeBlocks, addCopyButtons
│       ├── push-client.ts      # Client-side push subscription management
│       └── sw-register.ts      # Service worker registration
│
├── routes/
│   ├── +layout.server.ts       # Root layout: auth check from session
│   ├── +layout.svelte          # Root layout: imports app.css, registers service worker
│   ├── +page.server.ts         # Page data: auth + user
│   ├── +page.svelte            # Main page: login or chat (wires all components + stores)
│   ├── +error.svelte           # Error page
│   ├── auth/
│   │   ├── device/start/+server.ts   # POST: start device flow
│   │   ├── device/poll/+server.ts    # POST: poll device flow
│   │   ├── logout/+server.ts         # POST: destroy session
│   │   └── status/+server.ts         # GET: auth status + user info
│   ├── api/
│   │   ├── models/+server.ts         # GET: list models (authed)
│   │   ├── version/+server.ts        # GET: SDK version
│   │   ├── upload/+server.ts         # POST: file upload (multipart)
│   │   ├── sessions/sync/+server.ts  # GET/POST: session delta sync (Bearer auth)
│   │   ├── client-error/+server.ts   # POST: client error reporting
│   │   ├── push/subscribe/+server.ts     # POST: register push subscription
│   │   ├── push/unsubscribe/+server.ts   # POST: remove push subscription
│   │   └── push/vapid-key/+server.ts     # GET: public VAPID key
│   └── health/+server.ts             # GET: health check

static/
├── manifest.json               # PWA manifest (name, icons, start_url, display: standalone)
└── sw.js                       # Service worker: precaching, push handler, notification click

server.js                       # Custom Node.js entry: HTTP + WebSocket + SvelteKit handler
svelte.config.js                # SvelteKit config (adapter-node)
vite.config.ts                  # Vite config
```

## Data Flow

### Authentication

```
1. Browser loads / → SvelteKit SSR checks session → no token → renders DeviceFlowLogin
2. DeviceFlowLogin calls POST /auth/device/start → gets user_code
3. User enters code at github.com/login/device
4. DeviceFlowLogin polls POST /auth/device/poll → gets access_token
5. Token stored in server-side Express session (never sent to browser)
6. Page reloads → SSR finds token → renders chat screen
```

### Chat Message Flow

```
1. +page.svelte creates wsStore + chatStore + settingsStore
2. wsStore.connect() opens WebSocket to /ws
3. Server validates token, creates/reattaches CopilotClient
4. User types message → wsStore.sendMessage() → WS { type: 'message', content }
5. Server calls session.sendAndWait({ prompt }) with optional attachments
6. SDK streams events → handler.ts maps to typed messages → poolSend to client
7. wsStore dispatches to chatStore.handleServerMessage()
8. chatStore updates reactive state → Svelte re-renders components
```

### Session Pool

Each authenticated user gets one `PoolEntry` in the session pool:

```typescript
interface PoolEntry {
  client: CopilotClient;          // SDK client (owns CLI subprocess)
  session: CopilotSession | null; // Active session (one at a time)
  ws: WebSocket | null;           // Current browser connection
  messageBuffer: [];              // Buffered messages during disconnection
  ttlTimer: Timeout | null;       // Cleanup timer when disconnected
  permissionResolve: Function | null;  // Pending permission response
  permissionPreferences: Map;     // Remembered tool permissions
  userInputResolve: Function | null;   // Pending user input response
  isProcessing: boolean;          // Currently processing a message
}
```

On disconnect, a TTL timer starts. On reconnect, buffered messages are replayed.

### Session State & CLI Interop

Sessions are persisted by the SDK to `~/.copilot/session-state/{sessionId}/` (configurable via `COPILOT_CONFIG_DIR`):

```
session-state/{UUID}/
├── workspace.yaml       # Metadata: id, cwd, git context, summary, timestamps
├── checkpoints/
│   ├── index.md         # Checkpoint history table
│   └── 001-{title}.md   # Numbered checkpoint files
├── plan.md              # Execution plan (optional)
├── files/               # Workspace artifacts
└── events.jsonl         # Full conversation event log
```

Both the **Copilot CLI** and **Copilot Unleashed** share this directory. Sessions created in either interface can be resumed in the other — the SDK's `resumeSession()` automatically restores checkpoints and plan context. The session listing is enriched with filesystem metadata (checkpoint count, plan status, git context) for the UI.

**Bidirectional plan sync**: On resume, the filesystem `plan.md` is injected as a `systemMessage` (append mode) so the agent has full plan context. When the agent modifies the plan during a session, the `session.plan_changed` event triggers a read via `session.rpc.plan.read()` and the content is written back to `plan.md` on disk — enabling the CLI to pick up changes made in the browser.

### Session Persistence

A server-side `ChatStateStore` (`src/lib/server/chat-state-store.ts`) persists the full chat message array (the client-visible conversation) to disk, enabling **cold resume** — reconnecting to a conversation even after the in-memory session pool entry has expired and been cleaned up.

**Storage layout:**

```
{CHAT_STATE_PATH}/{username}/{tabId}.json
```

Each file contains the serialized `ChatMessage[]` for one browser tab's conversation, capped at **1,000 messages** per file. The `tabId` is a stable identifier generated client-side via `crypto.randomUUID()` and stored in **localStorage** (persists across tab restores and browser restarts).

**Cold resume flow:**

```
1. Browser reconnects WebSocket after pool entry TTL expired
2. Server receives WS upgrade — no PoolEntry found in memory
3. Server checks {CHAT_STATE_PATH}/{username}/{tabId}.json
4. If found: creates new CopilotClient, calls resumeSession() with last SDK session ID
5. Loads persisted ChatMessage[] and replays full history to browser via WS
6. User sees their previous conversation restored — can continue chatting
7. If not found: starts fresh session (existing behavior)
```

**Write strategy:** Writes are **atomic** — data is written to a `.tmp-{timestamp}-{uuid}` file, then renamed into place via `fs.rename()` to prevent corruption on crash. State is saved on message append, metadata update, and graceful disconnect.

### CLI ↔ Browser Session Autosync

Real-time synchronization of the SDK's `session-state/` directory between the Copilot CLI and Copilot Unleashed, so sessions created or updated in one tool appear instantly in the other.

**Mechanism** (`src/lib/server/session-watcher.ts`):

```
1. Server starts fs.watch() on the session-state directory (recursive)
2. File change events are debounced (100ms) to batch rapid writes
3. On change: server broadcasts { type: 'sessions_changed' } to all connected WS clients
4. Clients refresh session list in SessionsSheet component
```

**Initialization** (`src/lib/server/init.ts`): `initServerSideEffects()` is called at module load time from `hooks.server.ts`. It sets up the filesystem watcher and registers SIGTERM/SIGINT handlers for graceful cleanup.

**UI indicator:** When the Sessions panel is closed, a badge appears on the Sessions button indicating new/updated sessions are available.

**Docker bind mount for local development:**

```yaml
volumes:
  - ~/.copilot:/home/node/.copilot   # Shares session-state with host CLI
```

This enables bidirectional sync: sessions started in the host terminal's `copilot` CLI appear in the browser, and vice versa. In Azure deployments, the session-state directory lives on an EmptyDir volume (ephemeral, scoped to replica lifetime) instead (see [Filesystem Persistence](#filesystem-persistence-planned)).

## Component Architecture

### Store Pattern

All stores use Svelte 5 runes with the factory function pattern:

```typescript
export function createChatStore(wsStore: WsStore): ChatStore {
  let messages = $state<ChatMessage[]>([]);
  let isStreaming = $state(false);
  const canSend = $derived(isConnected && !isStreaming && wsStore.sessionReady);

  function handleServerMessage(msg: ServerMessage): void { /* switch on msg.type */ }

  return {
    get messages() { return messages; },
    get canSend() { return canSend; },
    handleServerMessage,
  };
}
```

### Message Type System

Discriminated unions on `type` field for all messages:

- **ServerMessage** (34 types): `connected`, `delta`, `tool_start`, `permission_request`, etc.
- **ClientMessage** (19 types): `new_session`, `message`, `set_mode`, `permission_response`, etc.
- **ChatMessage** (10 roles): `user`, `assistant`, `tool`, `info`, `warning`, `error`, `intent`, `usage`, `skill`, `subagent`

## Security

| Layer | Measure |
|-------|---------|
| CSP | self + unsafe-inline (Svelte), ws/wss, GitHub avatars |
| Rate limiting | 200 req / 15 min / IP (Map-based in hooks.server.ts) |
| Session | httpOnly, secure (prod), sameSite: lax, server-side only |
| Token | Freshness check + GitHub API validation on WS connect |
| WebSocket | Origin validation in production |
| Input | 10K char messages, 2K char instructions, message type whitelist |
| XSS | DOMPurify on all rendered markdown |
| Upload | 10MB/5 files limit, extension allowlist, path traversal prevention |
| SSRF | Internal IP range blocklist for custom webhook tools |
| Permissions | Per-tool allow/deny/always_allow with 30s timeout |

### Push Notifications — Web Push + PWA

Full Progressive Web App (PWA) support with push notifications, so users receive alerts even when the browser tab is closed or the device is locked.

**PWA foundation:**

- `static/manifest.json` with app name ("Copilot Unleashed"), icons (128/192/512px + maskable), theme color `#0d1117`, `display: standalone`
- Service worker (`static/sw.js`): precaches `/`, `/favicon.png`, `/manifest.json`; network-first fetch for navigation; push event handler with vibration and actions; auto-resubscribes on `pushsubscriptionchange`
- Registered from `+layout.svelte` on mount via `src/lib/utils/sw-register.ts`
- Installable on desktop and mobile (iOS requires Add to Home Screen, iOS 16.4+)

**VAPID key pair:** Generated via `node scripts/generate-vapid-keys.mjs`. Server reads `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` from env vars. The public key is exposed to the client via `GET /api/push/vapid-key`.

**Server-side components** (`src/lib/server/push/`):

| Component | Purpose |
|-----------|---------|
| `subscription-store.ts` | Per-user subscription CRUD at `{PUSH_STORE_PATH}/{userId}/subscriptions.json` (cap: 10 per user) |
| `sender.ts` | Sends push notifications via `web-push` package with 60-min TTL; auto-removes expired subscriptions (404/410) |

**API routes** (`src/routes/api/push/`):

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/push/subscribe` | POST | Register push subscription (validates HTTPS endpoint) |
| `/api/push/unsubscribe` | POST | Remove subscription by endpoint |
| `/api/push/vapid-key` | GET | Retrieve public VAPID key for client |

All push API endpoints require GitHub authentication.

**Push notification triggers** (sent only when the user's WebSocket is disconnected):

| Event | Notification |
|-------|-------------|
| `assistant.turn_end` | "Response ready" with message preview |
| `session.error` | "Something went wrong" with error summary |
| User input prompt (elicitation) | "Copilot is asking you something" |
| Permission prompt | "Tool approval needed" with tool name |

**Flow:**

```
1. Browser requests push permission → gets PushSubscription
2. Client sends subscription to POST /api/push/subscribe (stored per user)
3. User closes tab or loses connection
4. SDK event fires (response, error, prompt)
5. Server checks: user has no active WS connection?
6. If disconnected: sender delivers notification via web-push (60-min TTL)
7. User taps notification → opens app → WS reconnects → cold resume
```

## Environment Variables

| Variable | Required | Default | Purpose |
|----------|:--------:|---------|---------|
| `GITHUB_CLIENT_ID` | Yes | — | GitHub OAuth App client ID |
| `SESSION_SECRET` | Yes | — | Session cookie encryption |
| `PORT` | — | `3000` | HTTP server port |
| `BASE_URL` | — | `http://localhost:3000` | Cookie domain + WS origin |
| `NODE_ENV` | — | `development` | Dev vs prod behavior |
| `ALLOWED_GITHUB_USERS` | — | — | Comma-separated login allowlist |
| `TOKEN_MAX_AGE_MS` | — | `86400000` | Force re-auth interval (24h) |
| `VAPID_PUBLIC_KEY` | — | — | Web Push VAPID public key |
| `VAPID_PRIVATE_KEY` | — | — | Web Push VAPID private key |
| `VAPID_SUBJECT` | — | `mailto:admin@example.com` | VAPID subject identifier |
| `CHAT_STATE_PATH` | — | `.chat-state` (dev) / `/data/chat-state` (prod) | Persisted chat state directory |
| `PUSH_STORE_PATH` | — | `/data/push-subscriptions` | Push subscription storage |
| `COPILOT_CONFIG_DIR` | — | `~/.copilot` | SDK config/session directory (Azure: `/data/copilot-home`) |

## Deployment

- **Docker**: `npm run build` → `node build/index.js` (adapter-node output)
- **Azure**: `azd up` → Container Apps + ACR + Managed Identity + monitoring
- **CI/CD**: GitHub Actions — ci.yml (check + build), deploy.yml (Docker → ACR → ACA)

### Filesystem Persistence

All persistent application data lives under `/data`, with the layout varying by deployment target.

**Directory layout:**

```
/data/
├── chat-state/{username}/{tabId}.json   # Persisted chat conversations (1000-msg cap, atomic writes)
├── push-subscriptions/{username}/subscriptions.json   # Web Push subscriptions (10 per user)
├── copilot-home/                        # SDK state (Azure only — see COPILOT_CONFIG_DIR)
│   └── session-state/                   # SDK session files
└── uploads/                             # Uploaded file staging
```

**Deployment-specific storage:**

| Deployment | `/data` mount | `COPILOT_CONFIG_DIR` | CLI sync |
|-----------|--------------|---------------------|----------|
| **Azure** | EmptyDir volume (ephemeral, scoped to replica lifetime) | `/data/copilot-home` | N/A — no host CLI |
| **Local Docker** | Named volume (`copilot-data:/data`) | `/home/node/.copilot` (default) | Bind mount `~/.copilot:/home/node/.copilot` |
| **Dev (no Docker)** | Local filesystem `./data/` | `~/.copilot` (default) | Shared natively — same filesystem |

**Docker Compose volumes (local):**

```yaml
volumes:
  copilot-data:          # Named volume for /data (chat-state, push-subscriptions, uploads)

services:
  app:
    volumes:
      - copilot-data:/data
      - ~/.copilot:/home/node/.copilot   # Bind mount for CLI ↔ browser session sync
```

In Azure, `COPILOT_CONFIG_DIR=/data/copilot-home` moves the SDK's session-state onto the EmptyDir volume. Data persists across container restarts within the same replica, but is lost on replica replacement or scale-to-zero events.

### Azure Infrastructure Security

Lightweight Azure infrastructure (~$10–20/mo) using RBAC and managed identity — no VNet or private endpoints.

**Key Vault** (RBAC-only, publicNetworkAccess enabled) replaces inline Bicep secret values:

| Secret | Source |
|--------|--------|
| `github-client-id` | GitHub OAuth App |
| `session-secret` | Random 64-char string |
| `vapid-public-key` | Generated VAPID key pair |
| `vapid-private-key` | Generated VAPID key pair |

Container Apps access secrets via Managed Identity → Key Vault references (no secrets in environment variables or Bicep parameters).

**Resource configuration:**

| Resource | Configuration |
|----------|---------------|
| **ACR** (Basic SKU) | Deployer IP allowlist, admin user disabled |
| **Key Vault** | RBAC-only access policy, public network access enabled, network ACLs default Allow |
| **Container Apps** | Scale-to-zero (0–1 replicas), EmptyDir volume for `/data` |

**Monitoring:** Log Analytics workspace collects container logs and metrics for observability and audit.

**Bicep modules** (5 total): `container-apps`, `container-registry`, `key-vault`, `managed-identity`, `monitoring`.
