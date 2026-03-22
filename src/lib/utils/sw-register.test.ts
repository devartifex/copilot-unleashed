import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerServiceWorker } from '$lib/utils/sw-register';

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

beforeEach(() => {
	vi.spyOn(console, 'warn').mockImplementation(() => {});
	vi.spyOn(console, 'error').mockImplementation(() => {});
	vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('registerServiceWorker', () => {
	it('returns null and warns when serviceWorker is not supported', async () => {
		const restore = hideServiceWorker();
		const result = await registerServiceWorker();
		restore();

		expect(result).toBeNull();
		expect(console.warn).toHaveBeenCalledWith('[SW] Service workers not supported');
	});

	it('returns registration and logs scope when registration succeeds', async () => {
		const mockRegistration = { scope: '/' } as ServiceWorkerRegistration;
		const registerMock = vi.fn().mockResolvedValue(mockRegistration);
		Object.defineProperty(navigator, 'serviceWorker', {
			configurable: true,
			value: { register: registerMock },
		});

		const result = await registerServiceWorker();

		expect(result).toBe(mockRegistration);
		expect(registerMock).toHaveBeenCalledWith('/sw.js', { scope: '/' });
		expect(console.log).toHaveBeenCalledWith('[SW] Registered with scope:', '/');
	});

	it('returns null and logs error when registration throws', async () => {
		const registerMock = vi.fn().mockRejectedValue(new Error('Registration failed'));
		Object.defineProperty(navigator, 'serviceWorker', {
			configurable: true,
			value: { register: registerMock },
		});

		const result = await registerServiceWorker();

		expect(result).toBeNull();
		expect(console.error).toHaveBeenCalledWith('[SW] Registration failed:', expect.any(Error));
	});
});
