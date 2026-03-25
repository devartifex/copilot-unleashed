# Security Policy

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| 4.x     | :white_check_mark: |
| < 4.0   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, please use [GitHub's private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability).

### What to include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response timeline

- **Acknowledgement**: within 48 hours
- **Initial assessment**: within 5 business days
- **Fix & disclosure**: coordinated with reporter

## Security Architecture

This application follows security best practices.

### Authentication Hardening

- **GitHub Device Flow OAuth**: Public client — no client secret required or stored
- **Session fixation**: `session.regenerate()` after successful GitHub auth
- **Token handling**: GitHub tokens stored server-side only, never sent to browser
- **Token freshness**: tokens expire after 24 hours (configurable via `TOKEN_MAX_AGE_MS`); re-auth required
- **Authenticated endpoints**: All API endpoints require GitHub authentication via `checkAuth()`. Only `/health` remains public (infrastructure health check)
- **Periodic token revalidation**: GitHub tokens validated every 30 minutes via `revalidateTokenIfStale()` (`GET /user` API) to catch revoked tokens. Previously only validated on WebSocket connect

### Session Security

- **httpOnly, secure, sameSite cookies**: Session cookies use `httpOnly`, `secure` (production), and `sameSite: lax`
- **SESSION_SECRET required in production**: `SESSION_SECRET` is now required when `NODE_ENV=production` — server fails fast (throws) on missing value
- **File-based session store**: Server-side file-based session store with 24-hour TTL replaces in-memory sessions for persistence across restarts
- **Rolling sessions**: `maxAge` resets on each request, keeping active users authenticated

### CSP Hardening

- **Content-Security-Policy**: Restrictive CSP set in `hooks.server.ts` — `self` + `unsafe-inline` (required by Svelte) + `ws`/`wss` + GitHub avatar domains
- **XSS prevention**: DOMPurify sanitizes all rendered markdown; CSP restricts script sources
- **Subresource Integrity**: All dependencies are bundled at build time via Vite — no CDN scripts
- **Additional CSP directives**: `form-action 'self'`, `base-uri 'self'`, `object-src 'none'` added to prevent clickjacking and form hijacking. `manifest-src 'self'` for PWA. Push service endpoints (`*.push.services.mozilla.com`, `*.push.apple.com`, `fcm.googleapis.com`, `*.notify.windows.com`) added to `connect-src`

### SSRF Protection

- **URL validation**: Custom webhook and MCP tool URLs validated — HTTPS-only, private/internal IP ranges blocked
- **Redirect prevention**: Webhook and MCP URL fetches use `redirect: 'manual'` to prevent redirect-based SSRF to internal IPs

### CSRF Protection

- **SvelteKit built-in CSRF**: SvelteKit's built-in CSRF checking enabled
- **Origin header enforcement**: State-changing requests (POST/PUT/DELETE) rejected without `Origin` header in production, layered on top of SvelteKit's CSRF checking. Exception: `/api/sessions/sync` allows Bearer token auth without Origin header (for CLI scripts)

### Rate Limiting & WebSocket

- **Rate limiting**: 200 requests per 15 minutes per IP (Map-based)
- **WebSocket**: Origin validation, session-based auth, message type whitelist, 10K char message limit
- **Token revalidation on connect**: WebSocket connections validate GitHub token against GitHub's API

### Push Notification Security

- **VAPID key management**: VAPID keys stored in Azure Key Vault (production) or environment variables (local development)
- **Authenticated subscriptions**: All push API endpoints (`/api/push/*`) require GitHub authentication
- **HTTPS endpoint validation**: Push subscription endpoints must use HTTPS
- **Minimal payloads**: Push payloads contain no sensitive data — only notification titles and bodies

### Azure Infrastructure Security

- **Managed identity**: Used for ACR registry pull — no credentials stored in config
- **HTTPS-only ingress**: Azure Container Apps enforces HTTPS
- **Key Vault for secrets**: All secrets (SESSION_SECRET, VAPID keys, GitHub Client ID) stored in Azure Key Vault (RBAC-only) — no inline secrets in Container App configuration
- **Basic ACR**: Public access conditional on deployer IP parameter
- **Monitoring**: Container Apps Environment logs to Log Analytics workspace

## GitHub Secret Scanning

GitHub secret scanning and push protection are enabled for this repository.

- **Secret scanning** continuously scans committed content for supported credentials and other known secret formats.
- **Push protection** blocks supported secrets before they are pushed, helping prevent accidental credential exposure.
- **Repo admins** can re-run `scripts/setup-security.sh` to verify these settings or re-apply them if needed.

## Self-Hosting Security Checklist

If you deploy your own instance:

1. **Create your own GitHub OAuth App** — never share `GITHUB_CLIENT_ID`
2. **Generate a strong `SESSION_SECRET`** — at least 32 random characters
3. **Set `NODE_ENV=production`** — enables secure cookies and trust proxy
4. **Set `BASE_URL`** — must match your actual deployment URL for origin validation
5. **Restrict access** (recommended) — set `ALLOWED_GITHUB_USERS=user1,user2` to limit who can log in
6. **Review token lifetime** — default is 24 hours; customize with `TOKEN_MAX_AGE_MS`
7. **Enable HTTPS** — required in production (Azure Container Apps provides this automatically)
8. **Monitor logs** — security events are logged as structured JSON to stdout
9. **Set IP restrictions** (optional) — use `ipRestrictions` Bicep param to lock ACA ingress to known IPs
