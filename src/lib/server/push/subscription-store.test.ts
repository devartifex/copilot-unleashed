import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	createSubscriptionStore,
	type PushSubscriptionRecord,
	type SubscriptionStore,
} from './subscription-store.js';

function makeSub(endpoint: string, userId = 'user1'): PushSubscriptionRecord {
	return {
		endpoint,
		keys: { p256dh: `p256dh-${endpoint}`, auth: `auth-${endpoint}` },
		userId,
		createdAt: Date.now(),
	};
}

describe('subscription-store', () => {
	let tmpDir: string;
	let store: SubscriptionStore;

	beforeEach(async () => {
		tmpDir = await mkdtemp(join(tmpdir(), 'push-test-'));
		store = createSubscriptionStore(tmpDir);
	});

	afterEach(async () => {
		await rm(tmpDir, { recursive: true, force: true });
	});

	it('save and getByUser round-trip', async () => {
		const sub = makeSub('https://push.example.com/a');
		await store.save('user1', sub);

		const result = await store.getByUser('user1');
		expect(result).toHaveLength(1);
		expect(result[0].endpoint).toBe('https://push.example.com/a');
		expect(result[0].keys).toEqual(sub.keys);
	});

	it('deduplicates by endpoint', async () => {
		const sub1 = makeSub('https://push.example.com/dup');
		const sub2 = makeSub('https://push.example.com/dup');
		sub2.keys.auth = 'updated-auth';

		await store.save('user1', sub1);
		await store.save('user1', sub2);

		const result = await store.getByUser('user1');
		expect(result).toHaveLength(1);
		expect(result[0].keys.auth).toBe('updated-auth');
	});

	it('caps at 10 subscriptions per user', async () => {
		for (let i = 0; i < 12; i++) {
			await store.save('user1', makeSub(`https://push.example.com/${i}`));
		}

		const result = await store.getByUser('user1');
		expect(result).toHaveLength(10);
		// Oldest should have been evicted (0 and 1 dropped)
		expect(result[0].endpoint).toBe('https://push.example.com/2');
		expect(result[9].endpoint).toBe('https://push.example.com/11');
	});

	it('delete removes a specific endpoint', async () => {
		await store.save('user1', makeSub('https://push.example.com/keep'));
		await store.save('user1', makeSub('https://push.example.com/remove'));

		await store.delete('user1', 'https://push.example.com/remove');

		const result = await store.getByUser('user1');
		expect(result).toHaveLength(1);
		expect(result[0].endpoint).toBe('https://push.example.com/keep');
	});

	it('delete is a no-op for unknown endpoint', async () => {
		await store.save('user1', makeSub('https://push.example.com/a'));
		await store.delete('user1', 'https://push.example.com/nonexistent');

		const result = await store.getByUser('user1');
		expect(result).toHaveLength(1);
	});

	it('deleteAll clears all subscriptions for a user', async () => {
		await store.save('user1', makeSub('https://push.example.com/a'));
		await store.save('user1', makeSub('https://push.example.com/b'));

		await store.deleteAll('user1');

		const result = await store.getByUser('user1');
		expect(result).toHaveLength(0);
	});

	it('deleteAll is safe for non-existent user', async () => {
		await expect(store.deleteAll('ghost')).resolves.toBeUndefined();
	});

	it('getByUser returns empty array for unknown user', async () => {
		const result = await store.getByUser('nobody');
		expect(result).toEqual([]);
	});

	it('isolates subscriptions between users', async () => {
		await store.save('alice', makeSub('https://push.example.com/a', 'alice'));
		await store.save('bob', makeSub('https://push.example.com/b', 'bob'));

		expect(await store.getByUser('alice')).toHaveLength(1);
		expect(await store.getByUser('bob')).toHaveLength(1);
		expect((await store.getByUser('alice'))[0].endpoint).toBe('https://push.example.com/a');
	});
});
