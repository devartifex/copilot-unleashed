import { createChatStateStore } from './chat-state-store.js';
import { config } from './config.js';

export const chatStateStore = createChatStateStore(config.chatStatePath);
