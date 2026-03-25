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

  describe('reconnection resilience', () => {
    it('debounces rapid connect calls within 500ms', () => {
      const store = createWsStore();
      store.connect();
      const initial = sockets.length;

      // Second call within 500ms should be debounced
      store.connect();
      expect(sockets).toHaveLength(initial);

      // After 500ms, connect should work again
      vi.advanceTimersByTime(500);
      store.connect();
      expect(sockets).toHaveLength(initial + 1);
      store.disconnect();
    });

    it('uses reconnecting state after first successful connection', () => {
      const store = createWsStore();
      store.connect();
      expect(store.connectionState).toBe('connecting');

      sockets[sockets.length - 1].onopen?.({} as Event);
      expect(store.connectionState).toBe('connected');

      sockets[sockets.length - 1].onclose?.({ code: 1006, reason: '' } as CloseEvent);
      expect(store.connectionState).toBe('reconnecting');
      store.disconnect();
    });

    it('applies jitter to reconnect delay (not exact doubling)', () => {
      const store = createWsStore();
      store.connect();
      const sock = sockets[sockets.length - 1];
      sock.onopen?.({} as Event);

      sock.onclose?.({ code: 1006, reason: '' } as CloseEvent);
      const before = sockets.length;

      // At 2.2s (below 75% of 3s = 2.25s) it shouldn't have fired
      vi.advanceTimersByTime(2200);
      expect(sockets.length).toBe(before);

      // At 3.8s (above 125% of 3s = 3.75s) it should have fired
      vi.advanceTimersByTime(1600);
      expect(sockets.length).toBe(before + 1);
      store.disconnect();
    });

    it('does not schedule reconnect while tab is hidden', () => {
      Object.defineProperty(document, 'hidden', { value: false, configurable: true });
      const store = createWsStore();
      store.connect();
      const sock = sockets[sockets.length - 1];
      sock.onopen?.({} as Event);

      // Tab goes hidden
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      sock.onclose?.({ code: 1006, reason: '' } as CloseEvent);
      expect(store.connectionState).toBe('reconnecting');

      const countAfterClose = sockets.length;

      // Even after a long time, no reconnect attempt when hidden
      vi.advanceTimersByTime(60_000);
      expect(sockets.length).toBe(countAfterClose);

      // Tab becomes visible — should trigger reconnect
      Object.defineProperty(document, 'hidden', { value: false, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      expect(sockets.length).toBeGreaterThan(countAfterClose);
      store.disconnect();
    });

    it('starts heartbeat after connection opens', () => {
      const store = createWsStore();
      store.connect();
      const sock = sockets[sockets.length - 1];
      sock.onopen?.({} as Event);

      vi.advanceTimersByTime(25_000);
      expect(sock.send).toHaveBeenCalledWith(JSON.stringify({ type: 'ping' }));
      store.disconnect();
    });

    it('reconnects if heartbeat pong is not received within timeout', () => {
      const store = createWsStore();
      store.connect();
      const sock = sockets[sockets.length - 1];
      sock.onopen?.({} as Event);

      vi.advanceTimersByTime(25_000);
      expect(sock.send).toHaveBeenCalledWith(JSON.stringify({ type: 'ping' }));

      // Wait for pong timeout (5s) — should force reconnect
      vi.advanceTimersByTime(5_000);
      expect(store.connectionState).toBe('reconnecting');
      store.disconnect();
    });

    it('cancels heartbeat timeout when any message is received', () => {
      const store = createWsStore();
      store.connect();
      const sock = sockets[sockets.length - 1];
      sock.onopen?.({} as Event);

      vi.advanceTimersByTime(25_000);

      // Receive a pong before timeout
      sock.onmessage?.({ data: JSON.stringify({ type: 'pong' }) } as MessageEvent);

      // Pong timeout passes — should NOT disconnect
      vi.advanceTimersByTime(5_000);
      expect(store.connectionState).toBe('connected');
      store.disconnect();
    });

    it('cleans up online listener on disconnect', () => {
      const removeSpy = vi.spyOn(window, 'removeEventListener');
      const store = createWsStore();
      store.connect();

      store.disconnect();

      expect(removeSpy.mock.calls.some(([event]) => event === 'online')).toBe(true);
      removeSpy.mockRestore();
    });

    it('reconnects immediately on online event', () => {
      const store = createWsStore();
      store.connect();
      const sock = sockets[sockets.length - 1];
      sock.onopen?.({} as Event);
      sock.onclose?.({ code: 1006, reason: '' } as CloseEvent);

      // Advance past debounce
      vi.advanceTimersByTime(500);
      const socksBefore = sockets.length;

      window.dispatchEvent(new Event('online'));
      expect(sockets.length).toBeGreaterThanOrEqual(socksBefore + 1);
      store.disconnect();
    });

    it('resets backoff on visibility change', () => {
      Object.defineProperty(document, 'hidden', { value: false, configurable: true });
      const store = createWsStore();
      store.connect();
      const sock0 = sockets[sockets.length - 1];
      sock0.onopen?.({} as Event);

      // Escalate backoff through multiple failures
      sock0.onclose?.({ code: 1006, reason: '' } as CloseEvent);
      vi.advanceTimersByTime(4000);
      sockets[sockets.length - 1].onclose?.({ code: 1006, reason: '' } as CloseEvent);
      vi.advanceTimersByTime(8000);
      sockets[sockets.length - 1].onclose?.({ code: 1006, reason: '' } as CloseEvent);

      // Tab becomes visible — should reset backoff
      vi.advanceTimersByTime(500);
      document.dispatchEvent(new Event('visibilitychange'));
      const afterVisibility = sockets.length;

      // If this attempt fails, next retry should use initial delay (~3s)
      sockets[sockets.length - 1].onclose?.({ code: 1006, reason: '' } as CloseEvent);
      vi.advanceTimersByTime(4000);
      expect(sockets.length).toBeGreaterThan(afterVisibility);
      store.disconnect();
    });
  });
});
