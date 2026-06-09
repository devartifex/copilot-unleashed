/**
 * E2E tests for remote sessions and cloud session creation.
 *
 * Covers:
 * - Remote Sessions settings panel (mode picker, persistence, apply to session)
 * - remoteSession sent on new_session when not "off"
 * - Remote URL banner (remote_session_url → banner with github.com link, dismiss)
 * - Cloud session creation form in the sessions sheet (validation + new_cloud_session)
 */
import { test, expect, type Browser, type Page } from '@playwright/test';
import {
  createAuthenticatedPage,
  mockWebSocket,
  goToChat,
  openSidebar,
  MOCK_SESSIONS,
  type WsMessageHandler,
} from './helpers';

interface SetupResult {
  page: Page;
  clientMessages: Record<string, unknown>[];
  close: () => Promise<void>;
}

async function setupPage(browser: Browser, onMessage?: WsMessageHandler): Promise<SetupResult> {
  const { page, context } = await createAuthenticatedPage(browser);
  const clientMessages: Record<string, unknown>[] = [];

  // Settings API: in-memory store so the remote mode persists across PUT/GET
  let settings: Record<string, unknown> | null = null;
  await page.route('**/api/settings', async (route, request) => {
    if (request.method() === 'GET') {
      await route.fulfill({ json: { settings } });
      return;
    }
    if (request.method() === 'PUT') {
      const body = request.postDataJSON() as { settings?: Record<string, unknown> };
      if (body.settings) settings = body.settings;
      await route.fulfill({ json: { ok: true } });
      return;
    }
    await route.continue();
  });

  await mockWebSocket(page, {
    onMessage: (msg, ws) => {
      clientMessages.push(msg);
      if (msg.type === 'list_sessions') {
        ws.send(JSON.stringify({ type: 'sessions', sessions: MOCK_SESSIONS }));
      }
      onMessage?.(msg, ws);
    },
  });

  await goToChat(page);

  return { page, clientMessages, close: () => context.close() };
}

async function openSettings(page: Page) {
  await openSidebar(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.locator('.settings-panel')).toBeVisible();
}

async function openRemotePanel(page: Page) {
  await openSettings(page);
  await page.getByRole('button', { name: 'Remote Sessions' }).click();
  await expect(page.getByRole('radiogroup', { name: 'Remote session mode' })).toBeVisible();
}

async function openSessionsSheet(page: Page) {
  await openSidebar(page);
  await page.getByRole('button', { name: 'Sessions' }).click();
  await expect(page.locator('.sheet-panel')).toBeVisible();
}

test.describe('Remote sessions', () => {
  test('settings panel shows the three remote modes with Off selected by default', async ({ browser }) => {
    const app = await setupPage(browser);
    try {
      await openRemotePanel(app.page);

      const group = app.page.getByRole('radiogroup', { name: 'Remote session mode' });
      await expect(group.getByRole('radio')).toHaveCount(3);
      await expect(group.getByRole('radio', { name: /Off/ })).toBeChecked();
    } finally {
      await app.close();
    }
  });

  test('selecting Export persists and is sent on the next new session', async ({ browser }) => {
    const app = await setupPage(browser);
    try {
      await openRemotePanel(app.page);
      await app.page.getByRole('radio', { name: /Export/ }).check();
      await app.page.click('button.settings-close');

      // Trigger a new chat — new_session must carry remoteSession: "export"
      await openSidebar(app.page);
      await app.page.getByRole('button', { name: 'New Chat' }).click();

      await expect.poll(() =>
        app.clientMessages.filter((m) => m.type === 'new_session').at(-1)?.remoteSession ?? null,
      ).toBe('export');
    } finally {
      await app.close();
    }
  });

  test('Off mode does not include remoteSession in new_session', async ({ browser }) => {
    const app = await setupPage(browser);
    try {
      await openSidebar(app.page);
      await app.page.getByRole('button', { name: 'New Chat' }).click();

      await expect.poll(() =>
        app.clientMessages.filter((m) => m.type === 'new_session').length,
      ).toBeGreaterThan(0);
      const last = app.clientMessages.filter((m) => m.type === 'new_session').at(-1)!;
      expect(last).not.toHaveProperty('remoteSession');
    } finally {
      await app.close();
    }
  });

  test('Apply to current session sends remote_toggle', async ({ browser }) => {
    const app = await setupPage(browser, (msg, ws) => {
      if (msg.type === 'remote_toggle') {
        ws.send(JSON.stringify({ type: 'remote_toggled', enabled: true }));
        ws.send(JSON.stringify({ type: 'remote_session_url', url: 'https://github.com/copilot/c/test-123' }));
      }
    });
    try {
      await openRemotePanel(app.page);
      await app.page.getByRole('radio', { name: /Full remote/ }).check();
      await app.page.click('button:has-text("Apply to current session")');

      await expect.poll(() =>
        app.clientMessages.filter((m) => m.type === 'remote_toggle').at(-1)?.mode ?? null,
      ).toBe('on');

      // Banner appears with the github.com link after the server replies
      await app.page.click('button.settings-close');
      const banner = app.page.locator('.remote-banner');
      await expect(banner).toBeVisible();
      await expect(banner.getByRole('link', { name: 'Open on GitHub' }))
        .toHaveAttribute('href', 'https://github.com/copilot/c/test-123');
    } finally {
      await app.close();
    }
  });

  test('remote banner can be dismissed', async ({ browser }) => {
    const app = await setupPage(browser, (msg, ws) => {
      if (msg.type === 'new_session') {
        // Simulate the SDK announcing the remote URL right after session creation
        setTimeout(() => {
          ws.send(JSON.stringify({ type: 'remote_session_url', url: 'https://github.com/copilot/c/banner-1' }));
        }, 50);
      }
    });
    try {
      const banner = app.page.locator('.remote-banner');
      await expect(banner).toBeVisible();

      await banner.getByRole('button', { name: 'Dismiss remote session banner' }).click();
      await expect(banner).toBeHidden();
    } finally {
      await app.close();
    }
  });
});

test.describe('Cloud sessions', () => {
  test('cloud session form validates the owner before sending', async ({ browser }) => {
    const app = await setupPage(browser);
    try {
      await openSessionsSheet(app.page);
      await app.page.click('button.cloud-new-btn');

      await app.page.getByLabel('Owner').fill('-bad-owner-');
      await app.page.getByLabel('Repository').fill('repo');
      await app.page.click('button.cloud-submit');

      await expect(app.page.getByRole('alert')).toHaveText('Invalid repository owner');
      expect(app.clientMessages.filter((m) => m.type === 'new_cloud_session')).toHaveLength(0);
    } finally {
      await app.close();
    }
  });

  test('valid repository submits new_cloud_session and closes the sheet', async ({ browser }) => {
    const app = await setupPage(browser, (msg, ws) => {
      if (msg.type === 'new_cloud_session') {
        ws.send(JSON.stringify({
          type: 'cloud_session_created',
          sessionId: 'cloud-1',
          repository: msg.repository,
        }));
      }
    });
    try {
      await openSessionsSheet(app.page);
      await app.page.click('button.cloud-new-btn');

      await app.page.getByLabel('Owner').fill('octocat');
      await app.page.getByLabel('Repository').fill('hello-world');
      await app.page.getByLabel(/Branch/).fill('main');
      await app.page.click('button.cloud-submit');

      await expect.poll(() =>
        app.clientMessages.filter((m) => m.type === 'new_cloud_session').at(-1)?.repository ?? null,
      ).toEqual({ owner: 'octocat', name: 'hello-world', branch: 'main' });

      await expect(app.page.locator('.sheet-panel')).toBeHidden();
    } finally {
      await app.close();
    }
  });

  test('remote sessions show a remote badge in the list', async ({ browser }) => {
    const remoteSessions = [
      { ...MOCK_SESSIONS[0], id: 'remote-1', title: 'Cloud refactor', isRemote: true },
      ...MOCK_SESSIONS.slice(1),
    ];
    const app = await setupPage(browser, (msg, ws) => {
      if (msg.type === 'list_sessions') {
        ws.send(JSON.stringify({ type: 'sessions', sessions: remoteSessions }));
      }
    });
    try {
      await openSessionsSheet(app.page);
      await expect(app.page.locator('.indicator-remote')).toBeVisible();
      await expect(app.page.locator('.indicator-remote')).toHaveAttribute('aria-label', 'Remote session');
    } finally {
      await app.close();
    }
  });
});
