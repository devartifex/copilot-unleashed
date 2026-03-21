import { createSubscriptionStore, type SubscriptionStore } from './push/subscription-store.js';
import { config } from './config.js';

let _store: SubscriptionStore | null = null;

export function getSubscriptionStore(): SubscriptionStore {
  if (!_store) _store = createSubscriptionStore(config.pushStorePath);
  return _store;
}

// Backward-compat alias used in existing imports
export const subscriptionStore: SubscriptionStore = new Proxy({} as SubscriptionStore, {
  get(_target, prop) {
    return (getSubscriptionStore() as unknown as Record<string | symbol, unknown>)[prop];
  },
});
