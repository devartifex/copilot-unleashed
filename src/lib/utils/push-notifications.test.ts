import { beforeEach, describe, expect, it, vi } from 'vitest';
import { subscribeToPush } from '$lib/utils/push-notifications';

function mockPushEnvironment({
	existingSubscription = null as PushSubscription | null,
	permission = 'granted' as NotificationPermission,
	vapidKeyOk = true,
	subscribeOk = true,
	registerOk = true,
} = {}) {
	const mockSubscription = {
		endpoint: 'https://push.example.com/sub',
		unsubscribe: vi.fn().mockResolvedValue(true),
		toJSON: vi.fn().mockReturnValue({ endpoint: 'https://push.example.com/sub' }),
	} as unknown as PushSubscription;

	const getSubscription = vi.fn().mockResolvedValue(existingSubscription);
	const subscribe = vi.fn().mockResolvedValue(subscribeOk ? mockSubscription : null);
	const pushManager = { getSubscription, subscribe };
	const registration = { pushManager };

	Object.defineProperty(globalThis, 'navigator', {
		configurable: true,
		value: {
			serviceWorker: {
				ready: Promise.resolve(registration),
				register: vi.fn(),
			},
		},
	});

	Object.defineProperty(globalThis, 'window', {
		configurable: true,
		value: {
			...globalThis.window,
			PushManager: class {},
		},
	});

	Object.defineProperty(globalThis, 'Notification', {
		configurable: true,
		value: {
			permission,
			requestPermission: vi.fn().mockResolvedValue(permission),
		},
	});

	const fetchMock = vi.fn().mockImplementation((url: string) => {
		if (url === '/api/push/vapid-key') {
			return Promise.resolve({
				ok: vapidKeyOk,
				status: vapidKeyOk ? 200 : 500,
				json: () => Promise.resolve({ publicKey: vapidKeyOk ? 'dGVzdA==' : undefined }),
			});
		}
		if (url === '/api/push/subscribe') {
			return Promise.resolve({ ok: registerOk, status: registerOk ? 200 : 500 });
		}
		return Promise.resolve({ ok: false, status: 404 });
	});

	Object.defineProperty(globalThis, 'fetch', { configurable: true, value: fetchMock });
	Object.defineProperty(globalThis, 'atob', {
		configurable: true,
		value: (s: string) => Buffer.from(s, 'base64').toString('binary'),
	});

	return { getSubscription, subscribe, fetchMock, mockSubscription };
}

beforeEach(() => {
	vi.restoreAllMocks();
});

describe('subscribeToPush', () => {
	it('returns existing subscription without making network calls (idempotent)', async () => {
		const existingSubscription = {
			endpoint: 'https://push.example.com/existing',
		} as unknown as PushSubscription;

		const { getSubscription, fetchMock } = mockPushEnvironment({ existingSubscription });

		const result = await subscribeToPush();

		expect(result).toBe(existingSubscription);
		expect(getSubscription).toHaveBeenCalledTimes(1);
		// No VAPID fetch, no subscribe, no server registration
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('creates a new subscription when none exists', async () => {
		const { getSubscription, subscribe, fetchMock } = mockPushEnvironment({
			existingSubscription: null,
		});

		const result = await subscribeToPush();

		expect(result).not.toBeNull();
		expect(getSubscription).toHaveBeenCalledTimes(1);
		expect(subscribe).toHaveBeenCalledTimes(1);
		expect(fetchMock).toHaveBeenCalledWith('/api/push/vapid-key');
		expect(fetchMock).toHaveBeenCalledWith('/api/push/subscribe', expect.any(Object));
	});

	it('returns null when push is not supported', async () => {
		// Clear serviceWorker from navigator to simulate unsupported environment
		Object.defineProperty(globalThis, 'navigator', {
			configurable: true,
			value: {},
		});
		Object.defineProperty(globalThis, 'window', {
			configurable: true,
			value: {},
		});

		const result = await subscribeToPush();

		expect(result).toBeNull();
	});

	it('returns null when permission is denied', async () => {
		const { getSubscription } = mockPushEnvironment({
			existingSubscription: null,
			permission: 'denied',
		});

		const result = await subscribeToPush();

		expect(result).toBeNull();
		expect(getSubscription).toHaveBeenCalledTimes(1);
	});
});
