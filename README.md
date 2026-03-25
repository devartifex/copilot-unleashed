<p align="center">
  <img src="static/img/icon-512.png" width="120" alt="Copilot Unleashed logo">
</p>

<h1 align="center">Copilot Unleashed</h1>

<p align="center">
  <strong>Every Copilot model. One login. Any device. Your server.</strong>
</p>

<p align="center">
  <a href="https://github.com/devartifex/copilot-unleashed/releases/latest"><img src="https://img.shields.io/github/v/release/devartifex/copilot-unleashed?label=release&logo=github" alt="Latest Release"></a>
  <a href="https://github.com/devartifex/copilot-unleashed/actions/workflows/ci.yml"><img src="https://github.com/devartifex/copilot-unleashed/workflows/CI/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/copilot--sdk-v0.2.0-8A2BE2?logo=github" alt="Copilot SDK v0.2.0">
  <img src="https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white" alt="Docker">
  <a href="https://github.com/devartifex/copilot-unleashed/commits"><img src="https://img.shields.io/github/last-commit/devartifex/copilot-unleashed" alt="Last Commit"></a>
  <a href="https://github.com/devartifex/copilot-unleashed/stargazers"><img src="https://img.shields.io/github/stars/devartifex/copilot-unleashed?style=social" alt="Stars"></a>
</p>

<p align="center">
  Self-hosted multi-model AI chat built on the official <a href="https://github.com/github/copilot-sdk"><code>@github/copilot-sdk</code></a>.<br>
  Autopilot agents · live reasoning traces · native GitHub tools · SDK-native customizations for agents, skills, prompts, instructions, and MCP servers.
</p>

<p align="center">
  <img src="docs/screenshots/usecase-autopilot-desktop.png" width="720" alt="Autopilot agent — reads a GitHub issue, implements the feature, runs tests, and opens a PR autonomously">
</p>
<p align="center"><em>Autopilot reads issue #88, implements the fix, runs tests, and opens a PR — zero intervention.</em></p>

> Independent project — not affiliated with GitHub. MIT licensed.

---

## Features

- **Every Copilot model** — Claude Opus 4.6, GPT-5.4, Gemini 3 Pro, Claude Sonnet 4.6, and more — switch mid-conversation, keep full history
- **Autopilot agents** — plan, code, run tests, and open PRs autonomously with live tool execution
- **Extended thinking** — live reasoning traces with collapsible "Thinking…" blocks
- **SDK-native customizations** — agents, skills, prompts, instructions, and MCP servers — configure in `~/.copilot/`, toggle from the UI ([details ↓](#customizations))
- **Native GitHub tools** — issues, PRs, code search, repos, Actions — built in via the GitHub MCP server
- **Image & file attachments** — drop images, code, CSVs, or directories with `@` autocomplete; vision models analyze images inline
- **Issue & PR references** — type `#` to search and reference GitHub issues/PRs across all your repos
- **Persistent sessions** — resume any conversation on any device; chat state survives browser close via server-side storage with cold resume
- **CLI ↔ Browser sync** — sessions started in the Copilot CLI appear in the browser and vice versa ([details ↓](#cli--browser-sync))
- **Push notifications** — Web Push alerts when the browser is closed; full PWA support
- **Plan & Fleet mode** — editable execution plans with disk sync; multi-agent parallel execution
- **Quota tracking** — premium request usage, remaining balance, and reset date
- **Mobile-first dark UI** — WCAG AA accessible, touch-optimized, reduced-motion support
- **Self-hosted** — your data never leaves your server; deploy with Docker or `azd up`

---

## Customizations

The app mirrors the Copilot SDK's native customization model. Configure once, use everywhere — CLI and browser stay in sync.

| Type | Location | How to use |
|------|----------|------------|
| **Agents** | `~/.copilot/agents/*.agent.md` | Select in Settings → active for session |
| **Skills** | Discovered by SDK | Toggle in Settings → model can invoke |
| **Prompts** | `~/.copilot/prompts/*.prompt.md` | Type `/name` in chat → autocompletes |
| **Instructions** | `~/.copilot/copilot-instructions.md` | Auto-discovered, shown in Settings |
| **MCP Servers** | `~/.copilot/mcp-config.json` | Toggle in Settings → tools available |

> All paths also support repo-scoped variants (`.github/agents/`, `.github/prompts/`, `.github/instructions/`, `.github/mcp-config.json`).

Source badges in Settings show where each customization was discovered: **CLI** (SDK runtime), **User** (`~/.copilot`), or **Repo** (`.github/`).

---

## Quick Start

**Prerequisites:** [GitHub account with Copilot](https://github.com/features/copilot#pricing) (free tier works) + a [GitHub OAuth App](https://github.com/settings/developers).

> When creating the OAuth App, set **Homepage URL** to `http://localhost:3000` and leave **Authorization callback URL** blank — the app uses Device Flow, so no callback is needed.

**1. Set required environment variables**

Copy `.env.example` to `.env` (or create `.env`) and fill in the two required values:

```bash
GITHUB_CLIENT_ID=<your-oauth-app-client-id>   # From github.com/settings/developers
SESSION_SECRET=<random-32-byte-hex>            # Generate: openssl rand -hex 32
```

**2. Run**

_Docker (recommended):_

```bash
docker-compose up --build
```

_Local development (Node.js 24+):_

```bash
npm install
npm run dev
```

_Local production build:_

```bash
npm install && npm run build && npm start
```

Open [localhost:3000](http://localhost:3000). Log in with GitHub. Done.

---

## Configuration

| Variable | Required | Default | Purpose |
|----------|:--------:|---------|---------|
| `GITHUB_CLIENT_ID` | **yes** | — | Client ID from your [GitHub OAuth App](https://github.com/settings/developers) |
| `SESSION_SECRET` | **yes** | — | Random secret for cookie encryption — generate with `openssl rand -hex 32` |
| `PORT` | — | `3000` | HTTP server port |
| `ALLOWED_GITHUB_USERS` | — | — | Comma-separated GitHub usernames; omit to allow any authenticated user |
| `BASE_URL` | — | `http://localhost:3000` | Public URL — sets cookie domain and WebSocket origin validation |

<details>
<summary>All options</summary>

| Variable | Default | Purpose |
|----------|---------|---------|
| `NODE_ENV` | `development` | `production` enables secure cookies |
| `TOKEN_MAX_AGE_MS` | `86400000` | Force re-auth interval (24h) |
| `SESSION_POOL_TTL_MS` | `300000` | Session TTL when disconnected (5 min) |
| `MAX_SESSIONS_PER_USER` | `5` | Max concurrent tabs/devices |
| `COPILOT_CONFIG_DIR` | `~/.copilot` | Share with CLI for bidirectional sync |
| `SESSION_STORE_PATH` | `/data/sessions` | Persistent session directory |
| `SETTINGS_STORE_PATH` | `/data/settings` | Per-user settings directory |
| `CHAT_STATE_PATH` | `/data/chat-state` | Persisted chat state |
| `VAPID_PUBLIC_KEY` | — | Push notifications (base64url) |
| `VAPID_PRIVATE_KEY` | — | Push notifications (base64url) |
| `VAPID_SUBJECT` | — | Push subject (`mailto:` or `https:`) |
| `PUSH_STORE_PATH` | `/data/push-subscriptions` | Push subscription storage |

</details>

---

## Deploy to Azure

```bash
azd env set DEPLOYER_IP_ADDRESS "$(curl -s https://api.ipify.org)"
azd up
```

Container Apps, ACR (Basic), Key Vault (RBAC-only), managed identity, Log Analytics, and TLS — all provisioned automatically. `azd up` prompts for `GITHUB_CLIENT_ID` if not already set.

<details>
<summary>VAPID keys, troubleshooting, and details</summary>

**VAPID keys** (optional, for push notifications):

```bash
node scripts/generate-vapid-keys.mjs
azd env set VAPID_PUBLIC_KEY  "<key>"
azd env set VAPID_PRIVATE_KEY "<key>"
azd env set VAPID_SUBJECT     "mailto:you@example.com"
```

**Troubleshooting:**

- **MANIFEST_UNKNOWN**: Clear stale image tag with `azd env set SERVICE_WEB_IMAGE_NAME "" && azd up`
- **ACR 403 Forbidden**: Re-set deployer IP with `azd env set DEPLOYER_IP_ADDRESS "$(curl -s https://api.ipify.org)" && azd provision`
- **Key Vault secret missing**: Ensure `GITHUB_CLIENT_ID` is set, then `azd provision`

</details>

---

## CLI ↔ Browser Sync

Sessions started in the Copilot CLI appear in the browser and vice versa. The app shares `~/.copilot/session-state/` with the CLI — plan edits sync in both directions automatically.

```yaml
# docker-compose.yml — enable sync
volumes:
  - ~/.copilot:/home/node/.copilot
```

Push sessions to a remote instance without redeploying:

```bash
npm run sync:push -- https://your-app.azurecontainerapps.io
```

<details>
<summary>How sync works, session bundling, and more</summary>

The SDK stores each session as `~/.copilot/session-state/{uuid}/` with `workspace.yaml`, `plan.md`, and checkpoint files. When you resume a session from the browser, the SDK restores conversation history automatically. For disk-only sessions (e.g. bundled into Docker), the app falls back to reading checkpoint files directly and injecting them as context.

**Bundle sessions at build time** (Azure / CI):

```bash
npm run bundle-sessions   # snapshots ~/.copilot sessions
azd up                    # auto-runs via predeploy hook
```

The Sessions panel auto-refreshes every 30 seconds. Use `COPILOT_CONFIG_DIR` to customize the session-state path.

</details>

---

## How It Works

```
Browser ──WebSocket──▶ SvelteKit + server.js ──JSON-RPC──▶ Copilot SDK subprocess
```

1. GitHub Device Flow login → token stored server-side only
2. WebSocket opens → server spawns a `CopilotClient` per user
3. SDK streams events → server forwards as typed JSON → Svelte re-renders in real-time
4. On disconnect → session pooled with TTL, reconnect replays messages

[Architecture docs →](docs/ARCHITECTURE.md)

---

## Security

Device Flow OAuth (same as GitHub CLI). Tokens are server-side only, never sent to the browser. Sessions are encrypted, rate-limited, and validated against GitHub's API on every WebSocket connect.

<details>
<summary>Full security details</summary>

- CSP headers, CSRF protection, HSTS, X-Frame-Options DENY
- Rate limiting: 200 req / 15 min per IP (HTTP) + 30 msg / min per WebSocket
- Secure cookies: httpOnly, secure (prod), sameSite: lax
- DOMPurify on all rendered markdown
- SSRF blocklist for MCP server URLs (IPv4 + IPv6 internal ranges, HTTPS required)
- 10,000 char message limit, 10MB upload limit, extension allowlist
- Per-tool permission prompts with 30s auto-deny countdown
- Token revalidation on every WebSocket connect
- CodeQL scanning + secret scanning via GitHub Advanced Security
- All API endpoints require GitHub authentication — no anonymous access
- **Azure**: Key Vault (RBAC-only), Basic ACR with deployer IP allowlist, managed identity for pulls

</details>

---

<details>
<summary><strong>Screenshots</strong></summary>

<table>
<tr>
<td><img src="docs/screenshots/usecase-reasoning-desktop.png" width="480" alt="Extended reasoning with live thinking trace"></td>
<td><img src="docs/screenshots/usecase-code-desktop.png" width="480" alt="Code generation with syntax highlighting"></td>
</tr>
<tr>
<td align="center"><em>Extended thinking — live reasoning trace</em></td>
<td align="center"><em>Code generation with syntax highlighting</em></td>
</tr>
<tr>
<td><img src="docs/screenshots/chat-desktop.png" width="480" alt="Chat desktop UI"></td>
<td><img src="docs/screenshots/chat-mobile.png" width="200" alt="Mobile chat UI"></td>
</tr>
<tr>
<td align="center"><em>Clean desktop interface</em></td>
<td align="center"><em>Touch-optimized mobile</em></td>
</tr>
</table>

</details>

---

## Built With

SvelteKit 5 · Svelte 5 runes · TypeScript 5.7 · Node.js 24 · [`@github/copilot-sdk`](https://github.com/github/copilot-sdk) v0.2.0 · Vite · `ws` · Vitest · Playwright · Docker · Bicep

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
