import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';

export interface PushSubscriptionRecord {
	endpoint: string;
	keys: {
		p256dh: string;
		auth: string;
	};
	userId: string;
	createdAt: number;
}

export interface SubscriptionStore {
	save(userId: string, subscription: PushSubscriptionRecord): Promise<void>;
	getByUser(userId: string): Promise<PushSubscriptionRecord[]>;
	delete(userId: string, endpoint: string): Promise<void>;
	deleteAll(userId: string): Promise<void>;
}

export function createSubscriptionStore(basePath: string): SubscriptionStore {
	function filePath(userId: string): string {
		return join(basePath, userId, 'subscriptions.json');
	}

	async function loadSubscriptions(userId: string): Promise<PushSubscriptionRecord[]> {
		try {
			const data = await readFile(filePath(userId), 'utf-8');
			return JSON.parse(data);
		} catch {
			return [];
		}
	}

	async function saveSubscriptions(userId: string, subs: PushSubscriptionRecord[]): Promise<void> {
		const fp = filePath(userId);
		await mkdir(dirname(fp), { recursive: true });
		const tmp = `${fp}.tmp`;
		await writeFile(tmp, JSON.stringify(subs, null, 2));
		await rename(tmp, fp);
	}

	return {
		async save(userId, subscription) {
			const subs = await loadSubscriptions(userId);
			const filtered = subs.filter((s) => s.endpoint !== subscription.endpoint);
			filtered.push(subscription);
			// Cap at 10 subscriptions per user
			while (filtered.length > 10) filtered.shift();
			await saveSubscriptions(userId, filtered);
		},

		async getByUser(userId) {
			return loadSubscriptions(userId);
		},

		async delete(userId, endpoint) {
			const subs = await loadSubscriptions(userId);
			const filtered = subs.filter((s) => s.endpoint !== endpoint);
			if (filtered.length !== subs.length) {
				await saveSubscriptions(userId, filtered);
			}
		},

		async deleteAll(userId) {
			try {
				await unlink(filePath(userId));
			} catch {
				/* ignore missing file */
			}
		},
	};
}
