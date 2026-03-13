# Test Coverage Matrix

> **Living document** — update whenever a feature is added, changed, or removed.
> Last updated: 2026-03-13

## Coverage Summary

| Layer | Framework | Command | Status |
|-------|-----------|---------|--------|
| Unit | Vitest | `npm run test:unit` | ✅ Active |
| Integration | Vitest | `npm run test:unit` | ✅ Active |
| Component | Vitest + @testing-library/svelte | `npm run test:unit` | 🔜 Planned |
| E2E | Playwright | `npx playwright test` | ✅ Active |

## Feature Coverage

| Feature Area | Files Involved | Unit | Integration | Component | E2E | Status | Notes |
|---|---|---|---|---|---|---|---|
| Authentication & access control | guard.ts, session-utils.ts, device-flow routes | ✅ | ✅ | ❌ | ✅ | Partial | Component tests planned |
| Chat application shell | TopBar, Sidebar, Banner, stores | ❌ | ❌ | ❌ | ✅ | Minimal | E2E only |
| Real-time messaging & streaming | ws/handler.ts, chat.svelte.ts, markdown.ts | ✅ | ❌ | ❌ | ✅ | Partial | WS integration tests planned |
| Model selection & mode switching | ModelSelector, chat store | ❌ | ❌ | ❌ | ✅ | Minimal | E2E only |
| Plan mode & persistence | PlanPanel, plan handlers | ❌ | ❌ | ❌ | ❌ | Not covered | Needs all layers |
| Session management | session-metadata.ts, session-pool.ts, SessionsSheet | ✅ | ❌ | ❌ | ❌ | Partial | Unit tests only |
| Tools, MCP, permissions, agents | copilot/session.ts, PermissionPrompt | ✅ | ❌ | ❌ | ❌ | Partial | SSRF unit tests |
| File attachments | upload route, ChatInput | ❌ | ✅ | ❌ | ❌ | Partial | Integration tests only |
| Quota & usage telemetry | quota display, usage events | ❌ | ❌ | ❌ | ❌ | Not covered | Low priority |
| Operational safety | hooks.server.ts, health, config | ✅ | ✅ | N/A | ❌ | Partial | CSP, rate limit, config tests |

## Test Files Index

### Unit Tests (`src/**/*.test.ts`)
| Test File | Source File | Cases | Coverage |
|---|---|---|---|
| `src/lib/server/config.test.ts` | `src/lib/server/config.ts` | Env validation, defaults, allowlist | ✅ |
| `src/lib/server/auth/guard.test.ts` | `src/lib/server/auth/guard.ts` | checkAuth, token expiry, sessions | ✅ |
| `src/lib/server/auth/session-utils.test.ts` | `src/lib/server/auth/session-utils.ts` | Save/clear helpers | ✅ |
| `src/lib/server/settings-store.test.ts` | `src/lib/server/settings-store.ts` | JSON persistence, size cap | ✅ |
| `src/lib/server/copilot/session-metadata.test.ts` | `src/lib/server/copilot/session-metadata.ts` | Listing, parsing, counting | ✅ |
| `src/lib/server/ws/session-pool.test.ts` | `src/lib/server/ws/session-pool.ts` | Lifecycle, TTL, eviction | ✅ |
| `src/lib/utils/markdown.test.ts` | `src/lib/utils/markdown.ts` | Rendering, XSS, highlighting | ✅ |

### Integration Tests (`src/**/*.test.ts`)
| Test File | Source File | Cases | Coverage |
|---|---|---|---|
| `src/routes/health/health.test.ts` | `src/routes/health/+server.ts` | Health endpoint | ✅ |
| `src/routes/api/api-routes.test.ts` | Various API routes | Upload, models, version | ✅ |
| `src/lib/server/hooks.test.ts` | `src/hooks.server.ts` | CSP, rate limiting | ✅ |

### E2E Tests (`tests/*.spec.ts`)
| Test File | Cases | Coverage |
|---|---|---|
| `tests/login.spec.ts` | Device flow login UI | ✅ |
| `tests/chat.spec.ts` | Chat interaction | ✅ |
| `tests/messages.spec.ts` | Message rendering | ✅ |
| `tests/responsive.spec.ts` | Mobile/desktop layouts | ✅ |
| `tests/screenshots.spec.ts` | Visual regression | ✅ |

## How to Update This Document

When adding or modifying a feature:
1. Add/update the row in **Feature Coverage**
2. Add/update the entry in **Test Files Index**
3. Update the status emoji: ✅ covered, ❌ not covered, 🔜 planned
