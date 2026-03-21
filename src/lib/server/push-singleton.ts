import { createSubscriptionStore } from './push/subscription-store.js';
import { config } from './config.js';

export const subscriptionStore = createSubscriptionStore(config.pushStorePath);
