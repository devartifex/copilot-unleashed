import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWsStore } from '$lib/stores/ws.svelte.js';

const { notifyMock } = vi.hoisted(() => ({
  notifyMock: vi.fn(),
}));

vi.mock('$lib/utils/notifications.js', () => ({
  notify: notifyMock,
}));

const sockets: MockWebSocket[] = [];

class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;

  readonly url: string;
  readyState = MockWebSocket.OPEN;
  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = MockWebSocket.CLOSED;
  });
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    sockets.push(this);
  }
}

describe('createWsStore', () => {
  beforeEach(() => {
    sockets.length = 0;
    notifyMock.mockReset();
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each(['immediate', 'enqueue'] as const)('sends message delivery mode %s', (mode) => {
    const store = createWsStore();
    store.connect();

    store.sendMessage('Ship it', undefined, mode);

    expect(sockets).toHaveLength(1);
    expect(sockets[0].send).toHaveBeenCalledWith(JSON.stringify({
      type: 'message',
      content: 'Ship it',
      mode,
    }));
  });

  it('passes custom agents when creating a new session', () => {
    const store = createWsStore();
    store.connect();
    const customAgents = [
      { name: 'researcher', prompt: 'Research the codebase', description: 'Research agent' },
    ];

    store.newSession({
      model: 'gpt-4.1',
      customAgents,
    });

    expect(sockets).toHaveLength(1);
    expect(sockets[0].send).toHaveBeenCalledWith(JSON.stringify({
      type: 'new_session',
      model: 'gpt-4.1',
      customAgents,
    }));
  });

  describe('mobile reconnection', () => {
    it('resets backoff delay when tab becomes visible again', () => {
      const store = createWsStore();
      store.connect();
      const firstSocket = sockets[0];

      // Simulate several failed reconnects to escalate the backoff delay
      firstSocket.onclose?.({ code: 1006, reason: '' } as CloseEvent);
      // After onclose, scheduleReconnect fires with 3s delay and doubles to 6s
      // Advance to trigger the 3s reconnect
      vi.advanceTimersByTime(3000);
      // A new socket was created but it also fails
      sockets[1].onclose?.({ code: 1006, reason: '' } as CloseEvent);
      // Now delay is 12s, advance to trigger
      vi.advanceTimersByTime(6000);
      sockets[2].onclose?.({ code: 1006, reason: '' } as CloseEvent);
      // Now delay is 24s

      const socketsBeforeVisibility = sockets.length;

      // Simulate tab becoming visible — should reset backoff and reconnect immediately
      Object.defineProperty(document, 'hidden', { value: false, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));

      // A new connection attempt should have been made immediately
      expect(sockets.length).toBe(socketsBeforeVisibility + 1);

      // If this new attempt also fails, the next retry should use initial delay (3s), not 24s
      const latestSocket = sockets[sockets.length - 1];
      latestSocket.onclose?.({ code: 1006, reason: '' } as CloseEvent);

      // Advancing by 3s (initial delay) should trigger a new reconnect
      const socketsBeforeTimer = sockets.length;
      vi.advanceTimersByTime(3000);
      expect(sockets.length).toBe(socketsBeforeTimer + 1);
    });

    it('reconnects immediately on online event', () => {
      const store = createWsStore();
      store.connect();
      const firstSocket = sockets[0];

      // Simulate connection lost
      firstSocket.onclose?.({ code: 1006, reason: '' } as CloseEvent);

      // Escalate backoff a couple of times
      vi.advanceTimersByTime(3000);
      sockets[1].onclose?.({ code: 1006, reason: '' } as CloseEvent);

      const socketsBeforeOnline = sockets.length;

      // Simulate network coming back online
      window.dispatchEvent(new Event('online'));

      // Should have attempted reconnect immediately
      expect(sockets.length).toBe(socketsBeforeOnline + 1);
    });

    it('resets backoff delay on online event', () => {
      const store = createWsStore();
      store.connect();

      // Simulate several failed reconnects
      sockets[0].onclose?.({ code: 1006, reason: '' } as CloseEvent);
      vi.advanceTimersByTime(3000);
      sockets[1].onclose?.({ code: 1006, reason: '' } as CloseEvent);
      vi.advanceTimersByTime(6000);
      sockets[2].onclose?.({ code: 1006, reason: '' } as CloseEvent);
      // Backoff is now 24s

      // Simulate online event
      window.dispatchEvent(new Event('online'));

      // The online-triggered attempt also fails
      const latestSocket = sockets[sockets.length - 1];
      latestSocket.onclose?.({ code: 1006, reason: '' } as CloseEvent);

      // Next retry should use initial 3s delay, not 24s
      const socketsBeforeTimer = sockets.length;
      vi.advanceTimersByTime(3000);
      expect(sockets.length).toBe(socketsBeforeTimer + 1);
    });

    it('cleans up online listener on disconnect', () => {
      const removeSpy = vi.spyOn(window, 'removeEventListener');
      const store = createWsStore();
      store.connect();

      store.disconnect();

      expect(removeSpy.mock.calls.some(([event]) => event === 'online')).toBe(true);
      removeSpy.mockRestore();
    });
  });
});
