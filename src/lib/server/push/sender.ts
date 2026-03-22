import webPush from 'web-push';
import { config } from '../config.js';
import type { SubscriptionStore } from './subscription-store.js';

let configured = false;

function ensureConfigured(): boolean {
	if (configured) return true;
	if (!config.vapid.publicKey || !config.vapid.privateKey) {
		return false;
	}
	webPush.setVapidDetails(config.vapid.subject, config.vapid.publicKey, config.vapid.privateKey);
	configured = true;
	return true;
}

export interface PushPayload {
	title: string;
	body: string;
	url?: string;
	tag?: string;
}

export async function sendPushToUser(
	userId: string,
	payload: PushPayload,
	subscriptionStore: SubscriptionStore,
): Promise<void> {
	if (!ensureConfigured()) return;

	const subscriptions = await subscriptionStore.getByUser(userId);
	if (subscriptions.length === 0) return;

	const payloadStr = JSON.stringify(payload);

	const results = await Promise.allSettled(
		subscriptions.map(async (sub) => {
			try {
				await webPush.sendNotification(
					{ endpoint: sub.endpoint, keys: sub.keys },
					payloadStr,
					{ TTL: 60 * 60 },
				);
			} catch (err: unknown) {
				const statusCode = (err as { statusCode?: number }).statusCode;
				// 404 or 410 = subscription expired, remove it
				if (statusCode === 404 || statusCode === 410) {
					await subscriptionStore.delete(userId, sub.endpoint);
				}
				throw err;
			}
		}),
	);

	const failed = results.filter((r) => r.status === 'rejected');
	if (failed.length > 0) {
		console.warn(`[PUSH] ${failed.length}/${subscriptions.length} push(es) failed for ${userId}`);
	}
}
