# Copilot CLI Mobile — Project Instructions

## Project Overview

Self-hosted web app that brings GitHub Copilot CLI to mobile browsers via the official `@github/copilot-sdk`. Users authenticate with GitHub Device Flow, pick a model, and chat over WebSocket with real-time token streaming. Full parity with the desktop Copilot CLI (including built-in tools for GitHub API, file access, and shell).

## Architecture

- **Backend**: Express + TypeScript (Node.js 22+, Dockerfile uses Node 24)
- **Frontend**: Vanilla JS SPA (no framework) — dark theme, mobile-first
- **Real-time**: WebSocket with per-connection `CopilotClient` lifecycle
- **Auth**: GitHub Device Flow only (no client secret, no redirect URI)
- **Session**: Server-side Express sessions (file store in dev, memory in prod)
- **Deployment**: Docker container → Azure Container Apps via `azd up` or GitHub Actions

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 24+ (Docker uses node:24-slim) |
| Language | TypeScript 5.7 (strict mode, ES2022, NodeNext modules) |
| Server | Express 4.21 |
| AI Engine | `@github/copilot-sdk` 0.1.30 |
| WebSocket | `ws` 8.18 |
| Security | Helmet (CSP, HSTS), express-rate-limit (200 req/15 min), DOMPurify |
| Sessions | express-session + session-file-store |
| Build | `tsc` → `dist/` |
| Container | Multi-stage Dockerfile (builder + runtime) |
| IaC | Bicep (Azure Container Apps, ACR, Key Vault, Managed Identity, monitoring) |
| CI/CD | GitHub Actions (ci.yml + deploy.yml) |

## Project Structure

```
src/
├── index.ts              # Entry point — HTTP server + WebSocket setup
├── config.ts             # Env var validation (fail-fast)
├── server.ts             # Express app, middleware stack, routes
├── auth/
│   ├── github.ts         # GitHub Device Flow OAuth (fetch-based)
│   └── middleware.ts      # requireGitHub guard
├── copilot/
│   ├── client.ts         # CopilotClient factory
│   └── session.ts        # Session creation, model listing, MCP config
├── routes/
│   ├── auth.ts           # /auth/* (device/start, device/poll, logout, status)
│   └── api.ts            # /api/* (models) — behind requireGitHub
├── ws/
│   └── handler.ts        # WebSocket: chat streaming, message protocol
└── types/
    └── session.d.ts      # Express session type augmentation

public/
├── index.html            # SPA shell (two screens: login + chat)
├── css/style.css         # Dark theme, mobile-first, CSS custom properties
└── js/
    ├── app.js            # App init + auth orchestration
    ├── auth.js           # Device flow API client
    └── chat.js           # WebSocket client, markdown rendering, streaming
```

## Conventions

### Code Style
- **TypeScript**: camelCase for functions/variables, PascalCase for types
- **Files**: kebab-case (e.g., `container-apps.bicep`, `session.d.ts`)
- **CSS**: kebab-case class names, CSS custom properties for theming
- **No frameworks**: Frontend is vanilla JS — do not introduce React, Vue, or similar
- **ES Modules**: `"type": "module"` in package.json; use `.js` extensions in imports

### Patterns
- **Factory functions** over classes (e.g., `createCopilotClient()`)
- **Named exports** only (no default exports)
- **Fail-fast validation** in `config.ts` — throw on missing required env vars
- **Try-catch** in route handlers and WebSocket — return JSON errors to client
- **Defensive model listing** — return empty array on error, handle multiple API response shapes
- **Server-side secrets** — GitHub token stored in Express session, never sent to browser
- **Message type whitelist** — WebSocket handler validates against `VALID_MESSAGE_TYPES` Set

### Security Requirements
- CSP via Helmet: self + cdn.jsdelivr.net + GitHub avatars + WebSocket
- Rate limiting: 200 requests per 15 minutes per IP
- Session cookies: httpOnly, secure (prod), sameSite: lax, 30-day rolling
- XSS prevention: DOMPurify sanitizes all rendered markdown
- Max message length: 10,000 chars (validated server-side in `ws/handler.ts`)
- No client secret in OAuth — device flow only needs `GITHUB_CLIENT_ID`
- Trust proxy only in production

### Environment Variables
| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `GITHUB_CLIENT_ID` | Yes | — | GitHub OAuth App client ID |
| `SESSION_SECRET` | Yes | — | Session cookie encryption |
| `PORT` | No | 3000 | HTTP server port |
| `BASE_URL` | No | http://localhost:3000 | Cookie domain + WebSocket origin validation |
| `NODE_ENV` | No | development | Dev vs prod behavior |
| `SESSION_STORE_PATH` | No | .sessions | File-based session directory |
| `ALLOWED_GITHUB_USERS` | No | — | Comma-separated GitHub usernames allowed to log in |
| `TOKEN_MAX_AGE_MS` | No | 86400000 (24h) | Force re-auth after this many ms |

## Build & Run

```bash
# Docker (recommended)
docker compose up --build        # dev with hot-reload of public/
npm run dev                      # alias for docker compose up

# Local (requires Node 22+)
npm install && npm run build && npm start
npm run dev:local                # tsx watch mode

# Type check
npm run lint                     # tsc --noEmit
```

## Deployment

- **Azure**: `azd up` provisions ACR + Container Apps + Key Vault + Managed Identity + monitoring
- **CI**: GitHub Actions — ci.yml (lint + build on every push), deploy.yml (Docker build → ACR → Container Apps on push to main)
- **Docker**: Node 24 multi-stage build, installs `@github/copilot` CLI globally, drops to `node` user

## Important Notes

- The Copilot SDK spawns a CLI subprocess per connection — each `CopilotClient` must be `.stop()`'d on disconnect
- WebSocket connections share Express session middleware for auth validation
- Model defaults to `gpt-4.1` if not specified
- The `approveAll` permission handler matches desktop CLI behavior (SDK built-in tools are auto-approved)
- `.nvmrc` says 22 but Dockerfile uses node:24-slim (SDK's `@github/copilot` CLI needs `node:sqlite` from Node 24)
