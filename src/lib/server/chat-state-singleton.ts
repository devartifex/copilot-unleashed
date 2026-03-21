import { createChatStateStore, type ChatStateStore } from './chat-state-store.js';
import { config } from './config.js';

let _store: ChatStateStore | null = null;

export const chatStateStore: ChatStateStore = new Proxy({} as ChatStateStore, {
  get(_target, prop) {
    if (!_store) _store = createChatStateStore(config.chatStatePath);
    return (_store as unknown as Record<string | symbol, unknown>)[prop];
  },
});
