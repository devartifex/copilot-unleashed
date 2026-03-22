import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	isPushSupported,
	isStandalone,
	getPushSubscription,
	subscribeToPush,
	unsubscribeFromPush,
} from '$lib/utils/push-notifications';

// ---- Helpers ----------------------------------------------------------------

function makePushManager(overrides: {
	getSubscription?: ReturnType<typeof vi.fn>;
	subscribe?: ReturnType<typeof vi.fn>;
} = {}) {
	return {
		getSubscription: overrides.getSubscription ?? vi.fn().mockResolvedValue(null),
		subscribe: overrides.subscribe ?? vi.fn(),
	};
}

function installServiceWorkerMock(pushManager = makePushManager()) {
	const swMock = {
		ready: Promise.resolve({ pushManager }),
		register: vi.fn(),
	};
	Object.defineProperty(navigator, 'serviceWorker', {
		configurable: true,
		value: swMock,
	});
	return swMock;
}

/** Replace globalThis.navigator with a Proxy that hides the serviceWorker key. */
function hideServiceWorker() {
	const orig = globalThis.navigator;
	const proxy = new Proxy(orig, {
		has(target, key) {
			return key !== 'serviceWorker' && key in target;
		},
		get(target, key, receiver) {
			if (key === 'serviceWorker') return undefined;
			return Reflect.get(target, key, receiver);
		},
	});
	Object.defineProperty(globalThis, 'navigator', { configurable: true, value: proxy });
	return () => Object.defineProperty(globalThis, 'navigator', { configurable: true, value: orig });
}

function setPushManagerPresent(present: boolean) {
	if (present) {
		Object.defineProperty(window, 'PushManager', { configurable: true, value: class PushManager {} });
	}
	// When false: just ensure PushManager is not defined. Since jsdom does not include
	// PushManager natively, no action is needed — but we guard against a previous test
	// having set it by deleting it via the configurable descriptor.
	else {
		try {
			Object.defineProperty(window, 'PushManager', { configurable: true, value: undefined });
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			delete (window as unknown as any).PushManager;
		} catch {
			// best-effort — jsdom may not allow deletion
		}
	}
}

function installNotificationMock(permission: NotificationPermission = 'granted') {
	const mock = {
		requestPermission: vi.fn().mockResolvedValue(permission),
	};
	Object.defineProperty(globalThis, 'Notification', { configurable: true, value: mock });
	return mock;
}

function makeSubscription(overrides: Partial<{
	endpoint: string;
	unsubscribe: ReturnType<typeof vi.fn>;
}> = {}): PushSubscription {
	return {
		endpoint: overrides.endpoint ?? 'https://example.com/push/endpoint',
		toJSON: () => ({ endpoint: 'https://example.com/push/endpoint' }),
		unsubscribe: overrides.unsubscribe ?? vi.fn().mockResolvedValue(true),
	} as unknown as PushSubscription;
}

// A valid URL-safe base64 VAPID key (no padding needed for atob)
const VALID_VAPID_KEY = btoa('a'.repeat(65)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

// ---- Setup / teardown -------------------------------------------------------

beforeEach(() => {
	vi.spyOn(console, 'warn').mockImplementation(() => {});
	vi.spyOn(console, 'error').mockImplementation(() => {});
	vi.spyOn(console, 'log').mockImplementation(() => {});
	// Ensure matchMedia exists (jsdom doesn't implement it by default)
	Object.defineProperty(window, 'matchMedia', {
		configurable: true,
		value: vi.fn().mockReturnValue({ matches: false }),
	});
});

afterEach(() => {
	vi.restoreAllMocks();
});

// ---- isPushSupported --------------------------------------------------------

describe('isPushSupported', () => {
	it('returns false when serviceWorker is not in navigator', () => {
		const restore = hideServiceWorker();
		expect(isPushSupported()).toBe(false);
		restore();
	});

	it('returns false when PushManager is not in window', () => {
		installServiceWorkerMock();
		setPushManagerPresent(false);
		expect(isPushSupported()).toBe(false);
	});

	it('returns true when serviceWorker and PushManager are both present', () => {
		installServiceWorkerMock();
		setPushManagerPresent(true);
		expect(isPushSupported()).toBe(true);
	});
});

// ---- isStandalone -----------------------------------------------------------

describe('isStandalone', () => {
	it('returns true when display-mode is standalone', () => {
		Object.defineProperty(window, 'matchMedia', {
			configurable: true,
			value: vi.fn().mockReturnValue({ matches: true }),
		});
		expect(isStandalone()).toBe(true);
	});

	it('returns true when navigator.standalone is true (iOS)', () => {
		// matchMedia already set to { matches: false } in beforeEach
		Object.defineProperty(navigator, 'standalone', { configurable: true, value: true });
		expect(isStandalone()).toBe(true);
		Object.defineProperty(navigator, 'standalone', { configurable: true, value: undefined });
	});

	it('returns false when neither condition is met', () => {
		// matchMedia already set to { matches: false } in beforeEach
		Object.defineProperty(navigator, 'standalone', { configurable: true, value: undefined });
		expect(isStandalone()).toBe(false);
	});
});

// ---- getPushSubscription ----------------------------------------------------

describe('getPushSubscription', () => {
	it('returns null when push is not supported', async () => {
		const restore = hideServiceWorker();
		const result = await getPushSubscription();
		restore();
		expect(result).toBeNull();
	});

	it('returns the subscription from pushManager', async () => {
		const sub = makeSubscription();
		const pm = makePushManager({ getSubscription: vi.fn().mockResolvedValue(sub) });
		installServiceWorkerMock(pm);
		setPushManagerPresent(true);

		expect(await getPushSubscription()).toBe(sub);
		expect(pm.getSubscription).toHaveBeenCalledOnce();
	});

	it('returns null when there is no active subscription', async () => {
		const pm = makePushManager({ getSubscription: vi.fn().mockResolvedValue(null) });
		installServiceWorkerMock(pm);
		setPushManagerPresent(true);

		expect(await getPushSubscription()).toBeNull();
	});
});

// ---- subscribeToPush --------------------------------------------------------

describe('subscribeToPush', () => {
	it('returns null and warns when push is not supported', async () => {
		const restore = hideServiceWorker();
		const result = await subscribeToPush();
		restore();
		expect(result).toBeNull();
		expect(console.warn).toHaveBeenCalledWith('[PUSH] Push notifications not supported');
	});

	it('returns null when notification permission is denied', async () => {
		installServiceWorkerMock();
		setPushManagerPresent(true);
		installNotificationMock('denied');

		const result = await subscribeToPush();
		expect(result).toBeNull();
		expect(console.warn).toHaveBeenCalledWith('[PUSH] Notification permission denied');
	});

	it('returns null when VAPID key fetch fails', async () => {
		installServiceWorkerMock();
		setPushManagerPresent(true);
		installNotificationMock('granted');
		vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null, { status: 500 }));

		const result = await subscribeToPush();
		expect(result).toBeNull();
		expect(console.error).toHaveBeenCalledWith('[PUSH] Failed to fetch VAPID key:', 500);
	});

	it('returns null when no VAPID public key is configured', async () => {
		installServiceWorkerMock();
		setPushManagerPresent(true);
		installNotificationMock('granted');
		vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
			new Response(JSON.stringify({ publicKey: null }), { status: 200 })
		);

		const result = await subscribeToPush();
		expect(result).toBeNull();
		expect(console.error).toHaveBeenCalledWith('[PUSH] No VAPID public key configured');
	});

	it('returns null and unsubscribes locally when server registration fails', async () => {
		const sub = makeSubscription();
		const pm = makePushManager({ subscribe: vi.fn().mockResolvedValue(sub) });
		installServiceWorkerMock(pm);
		setPushManagerPresent(true);
		installNotificationMock('granted');
		vi.spyOn(globalThis, 'fetch')
			.mockResolvedValueOnce(new Response(JSON.stringify({ publicKey: VALID_VAPID_KEY }), { status: 200 }))
			.mockResolvedValueOnce(new Response(null, { status: 500 }));

		const result = await subscribeToPush();
		expect(result).toBeNull();
		expect(sub.unsubscribe).toHaveBeenCalledOnce();
		expect(console.error).toHaveBeenCalledWith('[PUSH] Failed to register subscription:', 500);
	});

	it('returns the subscription on the happy path', async () => {
		const sub = makeSubscription();
		const pm = makePushManager({ subscribe: vi.fn().mockResolvedValue(sub) });
		installServiceWorkerMock(pm);
		setPushManagerPresent(true);
		installNotificationMock('granted');
		vi.spyOn(globalThis, 'fetch')
			.mockResolvedValueOnce(new Response(JSON.stringify({ publicKey: VALID_VAPID_KEY }), { status: 200 }))
			.mockResolvedValueOnce(new Response(null, { status: 200 }));

		const result = await subscribeToPush();
		expect(result).toBe(sub);
		expect(console.log).toHaveBeenCalledWith('[PUSH] Successfully subscribed');
	});
});

// ---- unsubscribeFromPush ----------------------------------------------------

describe('unsubscribeFromPush', () => {
	it('returns true immediately when there is no existing subscription', async () => {
		installServiceWorkerMock();
		setPushManagerPresent(true);

		expect(await unsubscribeFromPush()).toBe(true);
	});

	it('notifies the server and unsubscribes locally', async () => {
		const sub = makeSubscription({ endpoint: 'https://push.example.com/sub' });
		const pm = makePushManager({ getSubscription: vi.fn().mockResolvedValue(sub) });
		installServiceWorkerMock(pm);
		setPushManagerPresent(true);
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null, { status: 200 }));

		expect(await unsubscribeFromPush()).toBe(true);
		expect(fetchSpy).toHaveBeenCalledWith('/api/push/unsubscribe', expect.objectContaining({ method: 'POST' }));
		expect(sub.unsubscribe).toHaveBeenCalledOnce();
	});

	it('still unsubscribes locally when the server request throws', async () => {
		const sub = makeSubscription();
		const pm = makePushManager({ getSubscription: vi.fn().mockResolvedValue(sub) });
		installServiceWorkerMock(pm);
		setPushManagerPresent(true);
		vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));

		expect(await unsubscribeFromPush()).toBe(true);
		expect(console.warn).toHaveBeenCalledWith('[PUSH] Server unsubscribe failed:', expect.any(Error));
		expect(sub.unsubscribe).toHaveBeenCalledOnce();
	});
});
