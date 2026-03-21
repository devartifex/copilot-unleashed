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
| Security | Helmet (CSP, HSTS), rate limiting, DOMPurify |
| Sessions | express-session bridged to SvelteKit via `x-session-id` header |
| Build | Vite → `build/` via adapter-node |
| Container | Multi-stage Dockerfile (builder + runtime) |
| IaC | Bicep (Container Apps, ACR, Managed Identity) |
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
│   ├── components/             # 17 Svelte 5 components
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
│   │   │   └── guard.ts               # Auth middleware
│   │   ├── copilot/
│   │   │   ├── client.ts              # CopilotClient factory
│   │   │   └── session.ts             # Session config (model, reasoning, tools, hooks)
│   │   ├── ws/
│   │   │   ├── handler.ts             # WebSocket handler: 22+ message types, SDK events
│   │   │   └── session-pool.ts        # Per-user session pool with TTL + buffer
│   │   ├── config.ts                  # Env var validation (fail-fast)
│   │   ├── security-log.ts            # Structured security event logging
│   │   └── session-store.ts           # Express session ↔ SvelteKit bridge
│   │
│   ├── types/
│   │   └── index.ts            # All types: server messages, client messages, state
│   │
│   └── utils/
│       └── markdown.ts         # renderMarkdown, highlightCodeBlocks, addCopyButtons
│
├── routes/
│   ├── +layout.server.ts       # Root layout: auth check from session
│   ├── +layout.svelte          # Root layout: imports app.css
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
│   │   └── client-error/+server.ts   # POST: client error reporting
│   └── health/+server.ts             # GET: health check

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

### Session Persistence (Planned)

A server-side `ChatStateStore` will persist the full chat message array (the client-visible conversation) to disk, enabling **cold resume** — reconnecting to a conversation even after the in-memory session pool entry has expired and been cleaned up.

**Storage layout:**

```
/data/chat-state/{username}/{tabId}.json
```

Each file contains the serialized `ChatMessage[]` for one browser tab's conversation. The `tabId` is a stable identifier generated client-side and stored in **localStorage** (moved from sessionStorage to survive tab restores and browser restarts).

**Cold resume flow:**

```
1. Browser reconnects WebSocket after pool entry TTL expired
2. Server receives WS upgrade — no PoolEntry found in memory
3. Server checks /data/chat-state/{username}/{tabId}.json
4. If found: creates new CopilotClient, calls resumeSession() with last SDK session ID
5. Loads persisted ChatMessage[] and replays full history to browser via WS
6. User sees their previous conversation restored — can continue chatting
7. If not found: starts fresh session (existing behavior)
```

**Write strategy:** Chat state is written to disk on every `session.idle` event (end of each assistant turn) and on graceful disconnect. Writes are atomic (write to temp file, then rename) to prevent corruption.

### CLI ↔ Browser Session Autosync (Planned)

Real-time synchronization of the SDK's `session-state/` directory between the Copilot CLI and Copilot Unleashed, so sessions created or updated in one tool appear instantly in the other.

**Mechanism:**

```
1. Server starts fs.watch() on the session-state directory (recursive)
2. File change events are debounced (100ms) to batch rapid writes
3. On change: server re-reads session metadata from disk
4. Broadcasts { type: 'sessions_changed' } to all connected WS clients
5. Clients refresh session list in SessionsSheet component
```

**UI indicator:** When the Sessions panel is closed, a badge appears on the Sessions button indicating new/updated sessions are available.

**Docker bind mount for local development:**

```yaml
volumes:
  - ~/.copilot:/home/node/.copilot   # Shares session-state with host CLI
```

This enables bidirectional sync: sessions started in the host terminal's `copilot` CLI appear in the browser, and vice versa. In Azure deployments, the session-state directory lives on a persistent NFS mount instead (see [Filesystem Persistence](#filesystem-persistence-planned)).

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

### Push Notifications — Web Push + PWA (Planned)

Full Progressive Web App (PWA) support with push notifications, so users receive alerts even when the browser tab is closed or the device is locked.

**PWA foundation:**

- `manifest.json` with app name, icons, theme color, `display: standalone`
- Service worker for offline caching and push event handling
- Installable on desktop and mobile (iOS requires Add to Home Screen, iOS 16.4+)

**VAPID key pair:** Server generates a VAPID key pair (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` env vars) used to authenticate push messages. The public key is exposed to the client for subscription.

**Server-side components:**

| Component | Purpose |
|-----------|---------|
| `push-store.ts` | Stores push subscriptions per user (persisted to `/data/push-subscriptions/`) |
| `push-sender.ts` | Sends push notifications using the `web-push` npm package |

**Push notification triggers** (sent only when the user's WebSocket is disconnected):

| Event | Notification |
|-------|-------------|
| Assistant response ready | "Your response is ready" with message preview |
| Session error | "Error in your session" with error summary |
| User input prompt (elicitation) | "Action required: input needed" |
| Permission prompt | "Action required: tool permission" |

**Flow:**

```
1. Browser requests push permission → gets PushSubscription
2. Client sends subscription to server (stored in push-store)
3. User closes tab or loses connection
4. SDK event fires (response, error, prompt)
5. Server checks: user has no active WS connection?
6. If disconnected: push-sender delivers notification via web-push
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
| `VAPID_PUBLIC_KEY` | — | — | Web Push VAPID public key (Planned) |
| `VAPID_PRIVATE_KEY` | — | — | Web Push VAPID private key (Planned) |
| `COPILOT_CONFIG_DIR` | — | `~/.copilot` | SDK config/session directory (Planned — Azure: `/data/copilot-home`) |

## Deployment

- **Docker**: `npm run build` → `node build/index.js` (adapter-node output)
- **Azure**: `azd up` → Container Apps + ACR + Managed Identity + monitoring
- **CI/CD**: GitHub Actions — ci.yml (check + build), deploy.yml (Docker → ACR → ACA)

### Filesystem Persistence (Planned)

All persistent application data lives under `/data`, with the layout varying by deployment target.

**Directory layout:**

```
/data/
├── chat-state/{username}/{tabId}.json   # Persisted chat conversations
├── push-subscriptions/{username}.json   # Web Push subscriptions
├── copilot-home/                        # SDK state (Azure only — see COPILOT_CONFIG_DIR)
│   └── session-state/                   # SDK session files
└── uploads/                             # Uploaded file staging
```

**Deployment-specific storage:**

| Deployment | `/data` mount | `COPILOT_CONFIG_DIR` | CLI sync |
|-----------|--------------|---------------------|----------|
| **Azure** | NFS file share (Premium Storage, VNet rules, RootSquash) | `/data/copilot-home` | N/A — no host CLI |
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

In Azure, `COPILOT_CONFIG_DIR=/data/copilot-home` moves the SDK's session-state onto the NFS mount so sessions persist across container restarts and scale events.

### Azure Infrastructure Security (Planned)

Hardened Azure infrastructure with network isolation, secret management, and private endpoints for all PaaS services.

**VNet topology:**

```
VNet (10.0.0.0/16)
├── snet-apps    (10.0.0.0/23)   # Container Apps Environment (delegated)
├── snet-pe      (10.0.2.0/24)   # Private Endpoints (ACR, Key Vault)
└── snet-storage (10.0.3.0/24)   # Storage NFS (service endpoints)
```

**Key Vault** replaces inline Bicep secret values:

| Secret | Source |
|--------|--------|
| `github-client-id` | GitHub OAuth App |
| `session-secret` | Random 64-char string |
| `vapid-public-key` | Generated VAPID key pair |
| `vapid-private-key` | Generated VAPID key pair |

Container Apps access secrets via Managed Identity → Key Vault references (no secrets in environment variables or Bicep parameters).

**Private endpoints and network rules:**

| Resource | Access |
|----------|--------|
| **ACR** (Premium SKU) | Private endpoint in `snet-pe`, public access disabled |
| **Storage** (NFS file share) | VNet rules on `snet-storage`, RootSquash enabled |
| **Key Vault** | Private endpoint in `snet-pe`, network ACL deny-all + VNet exception |

**Diagnostic settings** are enabled on all resources (Container Apps Environment, ACR, Key Vault, Storage Account), streaming logs and metrics to a Log Analytics workspace for observability and audit.
