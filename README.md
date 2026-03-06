# Copilot CLI Mobile

> **GitHub Copilot CLI from your phone** — a lightweight, self-hosted web app powered by the official [GitHub Copilot SDK](https://github.com/github/copilot-sdk).

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-22%2B-339933?logo=nodedotjs&logoColor=white" alt="Node.js 22+">
  <img src="https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Copilot_SDK-0.1.30-000000?logo=github&logoColor=white" alt="Copilot SDK">
  <img src="https://img.shields.io/badge/License-MIT-green" alt="MIT License">
</p>

---

## What Is This?

The same Copilot CLI experience you get on your terminal — but accessible from a mobile browser. Authenticate with GitHub, pick a model, and start chatting. The app uses the official `@github/copilot-sdk` under the hood, so it has full parity with the desktop Copilot CLI (including built-in tools for GitHub API, file access, and shell).

## Features

| Feature | Description |
|---------|-------------|
| **Copilot SDK** | `@github/copilot-sdk` — JSON-RPC to Copilot CLI, same engine as the desktop CLI |
| **Mobile-first UI** | Dark theme, responsive chat interface with markdown + syntax highlighting |
| **Streaming** | Real-time token-by-token responses over WebSocket |
| **GitHub Device Flow** | Same auth as `gh auth login` — enter a short code, no secrets needed |
| **Docker-ready** | Single `docker compose up` to run locally |
| **2 env vars** | Only `SESSION_SECRET` and `GITHUB_CLIENT_ID` required |

## Architecture

```
Mobile / Desktop Browser              Self-hosted Server
┌──────────────────────┐              ┌───────────────────────────┐
│                      │              │  Express + TypeScript     │
│  Chat UI (SPA)       │◄── WSS ────►│                           │
│                      │              │  ┌── Copilot SDK ───────┐ │
│  GitHub Device Flow  │── OAuth ───►│  │  CopilotClient        │ │
│  (enter code on      │              │  │  ├─ JSON-RPC (stdio)  │ │
│   github.com/login/  │              │  │  └─ Copilot CLI proc  │ │
│   device)            │              │  └──────────────────────┘ │
│                      │              │                           │
└──────────────────────┘              └───────────────────────────┘
```

**How it works:**

1. User opens the app → GitHub Device Flow starts (enter a code at `github.com/login/device`)
2. After auth → chat screen appears, user picks a model and starts chatting
3. Server creates a `CopilotClient` per WebSocket connection (SDK manages the CLI process)
4. Messages go through `sendAndWait()` → SDK emits `assistant.message_delta` events → streamed to browser
5. On disconnect → `client.stop()` cleans up the CLI process

## Getting Started

### Prerequisites

- **Node.js 22+** — required by `@github/copilot-sdk`
- **GitHub account** with an active [Copilot license](https://github.com/features/copilot#pricing) (free tier works)

### 1. Register a GitHub OAuth App

The app uses [GitHub Device Authorization Flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow) — the same flow as `gh auth login`. **No client secret needed.**

1. Go to [GitHub → Settings → Developer settings → OAuth Apps](https://github.com/settings/developers)
2. Click **New OAuth App**:
   - **Application name**: `Copilot CLI Mobile`
   - **Homepage URL**: `http://localhost:3000`
   - **Authorization callback URL**: `http://localhost:3000` (device flow never uses it)
3. Click **Register application**
4. Copy the **Client ID** → that's your `GITHUB_CLIENT_ID`

> No client secret, no redirect URI configuration, and no updates needed when the URL changes.

### 2. Set Environment Variables

Create a `.env` file:

```env
GITHUB_CLIENT_ID=<your-client-id>
SESSION_SECRET=<run: openssl rand -hex 32>
```

### 3. Run With Docker

```bash
docker compose up --build
```

Open [http://localhost:3000](http://localhost:3000) — enter the code on GitHub, and start chatting.

### 4. Run Directly (Without Docker)

```bash
npm install
npm run build
npm start
```

Or for development with hot reload:

```bash
npm run dev:local
```

## Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GITHUB_CLIENT_ID` | Yes | — | GitHub OAuth App client ID |
| `SESSION_SECRET` | Yes | — | Random string for session encryption (`openssl rand -hex 32`) |
| `PORT` | No | `3000` | HTTP server port |
| `BASE_URL` | No | `http://localhost:3000` | Full app URL (used for cookies) |
| `NODE_ENV` | No | `development` | Set to `production` for secure cookies |
| `SESSION_STORE_PATH` | No | `.sessions` | Directory for file-based session store |

## Security

- **Server-side token storage** — GitHub token is stored in the Express session, never sent to the browser
- **Security headers** — Helmet sets CSP, HSTS, X-Frame-Options, X-Content-Type-Options
- **Rate limiting** — per-IP request throttling (200 req / 15 min)
- **Secure cookies** — `httpOnly`, `secure` (in production), `sameSite: lax`
- **Full Copilot CLI parity** — SDK built-in tools (GitHub API, file access, shell) are approved via `approveAll`, matching the desktop CLI

## Project Structure

```
copilot-cli-mobile/
├── src/
│   ├── index.ts              # Server entry point
│   ├── config.ts             # Environment variable validation
│   ├── server.ts             # Express app, middleware, static files
│   ├── auth/
│   │   ├── github.ts         # GitHub Device Flow (OAuth)
│   │   └── middleware.ts     # requireGitHub guard
│   ├── copilot/
│   │   ├── client.ts         # CopilotClient factory
│   │   └── session.ts        # Session creation, model listing
│   ├── routes/
│   │   ├── auth.ts           # /auth/* (device flow, logout, status)
│   │   └── api.ts            # /api/* (models)
│   ├── ws/
│   │   └── handler.ts        # WebSocket: chat, streaming, lifecycle
│   └── types/
│       └── session.d.ts      # Express session type augmentation
├── public/
│   ├── index.html            # Single-page app shell
│   ├── css/style.css         # Dark theme, mobile-first
│   └── js/
│       ├── app.js            # App init + auth orchestration
│       ├── auth.js           # Device flow API client
│       └── chat.js           # Chat UI, WebSocket, markdown
├── Dockerfile                # Multi-stage build (Node 24 + Copilot CLI)
├── docker-compose.yml        # Local development
├── package.json
└── tsconfig.json
```

## Deployment

The app is a standard Docker container. Deploy it anywhere that runs containers — a VPS, a home server, or any cloud provider:

```bash
docker build -t copilot-cli-mobile .
docker run -p 3000:3000 \
  -e GITHUB_CLIENT_ID=<id> \
  -e SESSION_SECRET=<secret> \
  -e NODE_ENV=production \
  copilot-cli-mobile
```

Azure deployment infrastructure (Bicep templates for Container Apps) is included in the `infra/` directory for `azd up` if desired.

## License

MIT
