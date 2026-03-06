import { test, expect, type Page } from '@playwright/test';

// Helper: mock auth as authenticated so the chat screen is shown
async function mockAuthenticated(page: Page) {
  await page.route('**/auth/status', (route) =>
    route.fulfill({ json: { authenticated: true, githubUser: 'testuser' } }),
  );
  // Block WebSocket-triggered endpoints so they don't error
  await page.route('**/api/models', (route) =>
    route.fulfill({ json: { models: ['gpt-4.1', 'claude-sonnet-4', 'o4-mini'] } }),
  );
}

// Navigate and wait for the chat screen to appear
async function openChatScreen(page: Page) {
  await mockAuthenticated(page);
  // Stub WebSocket to prevent real connection (server would reject with 4001 → reload)
  await page.addInitScript(() => {
    window.WebSocket = class extends EventTarget {
      static readonly CONNECTING = 0;
      static readonly OPEN = 1;
      static readonly CLOSING = 2;
      static readonly CLOSED = 3;
      readonly CONNECTING = 0;
      readonly OPEN = 1;
      readonly CLOSING = 2;
      readonly CLOSED = 3;
      readyState = 3;
      url = '';
      protocol = '';
      extensions = '';
      bufferedAmount = 0;
      binaryType: BinaryType = 'blob';
      onopen: ((ev: Event) => void) | null = null;
      onclose: ((ev: CloseEvent) => void) | null = null;
      onmessage: ((ev: MessageEvent) => void) | null = null;
      onerror: ((ev: Event) => void) | null = null;
      send() {}
      close() {}
    } as unknown as typeof WebSocket;
  });
  await page.goto('/');
  await expect(page.locator('#chat-screen')).toBeVisible({ timeout: 10000 });
}

test.describe('Chat screen', () => {
  test('shows chat screen when authenticated', async ({ page }) => {
    await openChatScreen(page);
    await expect(page.locator('#github-screen')).toBeHidden();
  });

  test('displays banner with ASCII art', async ({ page }) => {
    await openChatScreen(page);
    const banner = page.locator('#banner');
    await expect(banner).toBeVisible();
    await expect(banner.locator('.banner-art')).toBeVisible();
    await expect(banner.locator('.banner-sub')).toContainText('Describe a task');
  });

  test('shows environment info line', async ({ page }) => {
    await openChatScreen(page);
    const envLines = page.locator('#env-lines');
    await expect(envLines).toBeVisible();
    await expect(envLines).toContainText('model');
  });

  test('shows message input area', async ({ page }) => {
    await openChatScreen(page);
    const input = page.locator('#message-input');
    await expect(input).toBeVisible();
    await expect(input).toHaveAttribute('placeholder', /Ask Copilot/);
  });

  test('shows status indicator prompt', async ({ page }) => {
    await openChatScreen(page);
    const indicator = page.locator('#status-indicator');
    await expect(indicator).toBeVisible();
    await expect(indicator).toHaveText('❯');
  });

  test('shows mode toggle with options', async ({ page }) => {
    await openChatScreen(page);
    const modeToggle = page.locator('#mode-toggle');
    await expect(modeToggle).toBeVisible();

    const buttons = modeToggle.locator('.mode-opt');
    await expect(buttons).toHaveCount(3);
    await expect(buttons.nth(0)).toHaveAttribute('data-mode', 'interactive');
    await expect(buttons.nth(1)).toHaveAttribute('data-mode', 'plan');
    await expect(buttons.nth(2)).toHaveAttribute('data-mode', 'autopilot');
  });

  test('shows model selector', async ({ page }) => {
    await openChatScreen(page);
    const modelSelect = page.locator('#model-select');
    await expect(modelSelect).toBeVisible();
  });

  test('shows new chat button', async ({ page }) => {
    await openChatScreen(page);
    const newChatBtn = page.locator('#new-chat-btn');
    await expect(newChatBtn).toBeVisible();
    await expect(newChatBtn).toHaveText('new');
  });

  test('shows logout button', async ({ page }) => {
    await openChatScreen(page);
    const logoutBtn = page.locator('#logout-btn');
    await expect(logoutBtn).toBeVisible();
    await expect(logoutBtn).toHaveText('quit');
  });

  test('messages container is initially empty', async ({ page }) => {
    await openChatScreen(page);
    const messages = page.locator('#messages');
    await expect(messages).toBeVisible();
    await expect(messages).toBeEmpty();
  });

  test('input area contains status bar with controls', async ({ page }) => {
    await openChatScreen(page);
    const statusBar = page.locator('.status-bar');
    await expect(statusBar).toBeVisible();
    await expect(statusBar.locator('.status-left')).toBeVisible();
    await expect(statusBar.locator('.status-right')).toBeVisible();
  });

  test('banner shows tip and warning', async ({ page }) => {
    await openChatScreen(page);
    await expect(page.locator('#banner .banner-tip')).toContainText('selector below');
    await expect(page.locator('#banner .banner-warn')).toContainText('Always verify');
  });
});
