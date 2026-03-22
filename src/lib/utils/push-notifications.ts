/**
 * Check if push notifications are supported.
 * iOS Safari requires the app to be installed as PWA (standalone mode).
 */
export function isPushSupported(): boolean {
	if (typeof window === 'undefined') return false;
	if (!('serviceWorker' in navigator)) return false;
	if (!('PushManager' in window)) return false;
	return true;
}

/**
 * Check if the app is running as an installed PWA (standalone).
 * Required for iOS push notifications.
 */
export function isStandalone(): boolean {
	if (typeof window === 'undefined') return false;
	return (
		window.matchMedia('(display-mode: standalone)').matches ||
		(navigator as unknown as { standalone?: boolean }).standalone === true
	);
}

/**
 * Check current push subscription status.
 */
export async function getPushSubscription(): Promise<PushSubscription | null> {
	if (!isPushSupported()) return null;

	const registration = await navigator.serviceWorker.ready;
	return registration.pushManager.getSubscription();
}

/**
 * Subscribe to push notifications.
 * Fetches the VAPID public key from the server, creates a subscription,
 * and registers it with the server.
 */
export async function subscribeToPush(): Promise<PushSubscription | null> {
	if (!isPushSupported()) {
		console.warn('[PUSH] Push notifications not supported');
		return null;
	}

	// Request notification permission
	const permission = await Notification.requestPermission();
	if (permission !== 'granted') {
		console.warn('[PUSH] Notification permission denied');
		return null;
	}

	// Fetch VAPID public key from server
	const response = await fetch('/api/push/vapid-key');
	if (!response.ok) {
		console.error('[PUSH] Failed to fetch VAPID key:', response.status);
		return null;
	}
	const { publicKey } = await response.json();
	if (!publicKey) {
		console.error('[PUSH] No VAPID public key configured');
		return null;
	}

	// Convert VAPID key to Uint8Array
	const applicationServerKey = urlBase64ToUint8Array(publicKey);

	// Subscribe via Push API
	const registration = await navigator.serviceWorker.ready;
	const subscription = await registration.pushManager.subscribe({
		userVisibleOnly: true,
		applicationServerKey
	});

	// Register subscription with our server
	const registerResponse = await fetch('/api/push/subscribe', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(subscription.toJSON())
	});

	if (!registerResponse.ok) {
		console.error('[PUSH] Failed to register subscription:', registerResponse.status);
		// Unsubscribe since server registration failed
		await subscription.unsubscribe();
		return null;
	}

	console.log('[PUSH] Successfully subscribed');
	return subscription;
}

/**
 * Unsubscribe from push notifications.
 */
export async function unsubscribeFromPush(): Promise<boolean> {
	const subscription = await getPushSubscription();
	if (!subscription) return true;

	// Notify server
	try {
		await fetch('/api/push/unsubscribe', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ endpoint: subscription.endpoint })
		});
	} catch (err) {
		console.warn('[PUSH] Server unsubscribe failed:', err);
	}

	// Unsubscribe locally
	return subscription.unsubscribe();
}

/**
 * Convert URL-safe base64 VAPID key to Uint8Array for Push API.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
	const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
	const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
	const rawData = atob(base64);
	const buffer = new ArrayBuffer(rawData.length);
	const outputArray = new Uint8Array(buffer);
	for (let i = 0; i < rawData.length; ++i) {
		outputArray[i] = rawData.charCodeAt(i);
	}
	return outputArray;
}
