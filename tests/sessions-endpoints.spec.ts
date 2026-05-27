import { test, expect } from '@playwright/test';

/**
 * End-to-end coverage for the new session endpoints added in the
 * SDK 1.0.0-beta.8 upgrade. These specs hit the real built server
 * (booted by the Playwright webServer config) to verify wiring and
 * auth behaviour beyond what the vitest module-level mocks can prove.
 *
 * Per-session `remoteSession: "on"` and the cloud agents endpoint
 * cannot be exercised in a hermetic test — they would publish real
 * sessions to production Copilot infrastructure under the test
 * GitHub account — so those code paths are covered by unit tests
 * and the manual smoke procedure documented in the PR.
 */

test.describe('New session endpoints', () => {
  test('GET /api/sessions/last rejects unauthenticated requests', async ({ request }) => {
    const response = await request.get('/api/sessions/last');
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error).toBeTruthy();
  });

  test('GET /api/sessions/last returns JSON even on auth failure', async ({ request }) => {
    const response = await request.get('/api/sessions/last');
    expect(response.headers()['content-type']).toContain('application/json');
  });

  test('OPTIONS/HEAD do not crash the route', async ({ request }) => {
    const response = await request.fetch('/api/sessions/last', { method: 'HEAD' });
    // SvelteKit returns 405 for unsupported methods on a route, not 500.
    expect([401, 405]).toContain(response.status());
  });
});
