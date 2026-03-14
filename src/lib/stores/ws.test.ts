import { beforeEach, describe, expect, it, vi } from 'vitest';
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
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);
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
});
