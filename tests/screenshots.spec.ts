/**
 * Screenshot generation script — run with:
 *   npx playwright test tests/screenshots.spec.ts --project=desktop
 *
 * Outputs to docs/screenshots/
 */

import { test, type Page, type Browser } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const OUT_DIR = path.resolve('docs/screenshots');

test.beforeAll(() => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
});

const WS_STUB = () => {
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
};

async function openLogin(browser: Browser, viewport: { width: number; height: number }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  await page.route('**/auth/status', (r) =>
    r.fulfill({ json: { authenticated: false, githubUser: null } }),
  );
  // Device flow starts automatically on page load — serve a fake code
  await page.route('**/auth/github/device/start', (r) =>
    r.fulfill({
      json: {
        user_code: 'B4F2-9AE1',
        device_code: 'dc',
        verification_uri: 'https://github.com/login/device',
        expires_in: 900,
        interval: 5,
      },
    }),
  );
  await page.route('**/auth/github/device/poll', (r) =>
    r.fulfill({ json: { status: 'pending' } }),
  );
  await page.goto('/');
  // Wait for the device code to be rendered (app auto-starts device flow)
  await page.waitForFunction(
    () => {
      const el = document.getElementById('device-code-text');
      return el && el.textContent && el.textContent.includes('-') && !el.textContent.includes('- - -');
    },
    { timeout: 10000 },
  );
  return { page, ctx };
}

async function openChat(browser: Browser, viewport: { width: number; height: number }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  await page.route('**/auth/status', (r) =>
    r.fulfill({ json: { authenticated: true, githubUser: 'g-mercuri' } }),
  );
  await page.addInitScript(WS_STUB);
  await page.goto('/');
  await page.waitForSelector('#chat-screen', { state: 'visible' });
  return { page, ctx };
}

/** Inject a realistic conversation directly into the DOM (Chat is not on window) */
async function injectConversation(page: Page) {
  await page.evaluate(() => {
    const messagesEl = document.getElementById('messages')!;

    // User message
    const userEl = document.createElement('div');
    userEl.className = 'message user';
    const promptLine = document.createElement('div');
    promptLine.className = 'user-prompt-line';
    const prompt = document.createElement('span');
    prompt.className = 'term-prompt';
    prompt.textContent = '❯';
    const text = document.createElement('span');
    text.className = 'user-text';
    text.textContent = 'List open issues in my repo with a brief summary';
    promptLine.appendChild(prompt);
    promptLine.appendChild(text);
    userEl.appendChild(promptLine);
    messagesEl.appendChild(userEl);

    // Assistant message
    const assistantEl = document.createElement('div');
    assistantEl.className = 'message assistant';
    const marker = document.createElement('span');
    marker.className = 'assistant-marker';
    marker.textContent = '◆';
    const contentDiv = document.createElement('div');
    contentDiv.className = 'content';
    // Rendered markdown (simplified)
    contentDiv.innerHTML = `
      <h2>Open Issues</h2>
      <p>Here are the currently open issues:</p>
      <table>
        <thead><tr><th>#</th><th>Title</th><th>Labels</th></tr></thead>
        <tbody>
          <tr><td><a href="#">#42</a></td><td>Add screenshot support to README</td><td><code>documentation</code></td></tr>
          <tr><td><a href="#">#38</a></td><td>Mobile keyboard overlaps input on iOS</td><td><code>bug</code>, <code>mobile</code></td></tr>
          <tr><td><a href="#">#31</a></td><td>Support Gemini 2.0 Flash</td><td><code>enhancement</code></td></tr>
        </tbody>
      </table>
      <p>Found <strong>3 open issues</strong>. Use <code>gh issue view &lt;number&gt;</code> for full details.</p>`;
    assistantEl.appendChild(marker);
    assistantEl.appendChild(contentDiv);
    messagesEl.appendChild(assistantEl);
  });
  await page.waitForTimeout(200);
}

// ── Login screens ─────────────────────────────────────────────────────────────

test('screenshot: login — mobile', async ({ browser }) => {
  test.skip(!!process.env.CI, 'screenshot generation skipped in CI');
  const { page, ctx } = await openLogin(browser, { width: 390, height: 844 });
  await page.screenshot({ path: `${OUT_DIR}/login-mobile.png`, fullPage: false });
  await ctx.close();
});

test('screenshot: login — desktop', async ({ browser }) => {
  test.skip(!!process.env.CI, 'screenshot generation skipped in CI');
  const { page, ctx } = await openLogin(browser, { width: 1280, height: 800 });
  await page.screenshot({ path: `${OUT_DIR}/login-desktop.png`, fullPage: false });
  await ctx.close();
});

// ── Chat screens ──────────────────────────────────────────────────────────────

test('screenshot: chat — mobile', async ({ browser }) => {
  test.skip(!!process.env.CI, 'screenshot generation skipped in CI');
  const { page, ctx } = await openChat(browser, { width: 390, height: 844 });
  await injectConversation(page);
  await page.screenshot({ path: `${OUT_DIR}/chat-mobile.png`, fullPage: false });
  await ctx.close();
});

test('screenshot: chat — desktop', async ({ browser }) => {
  test.skip(!!process.env.CI, 'screenshot generation skipped in CI');
  const { page, ctx } = await openChat(browser, { width: 1280, height: 800 });
  await injectConversation(page);
  await page.screenshot({ path: `${OUT_DIR}/chat-desktop.png`, fullPage: false });
  await ctx.close();
});
