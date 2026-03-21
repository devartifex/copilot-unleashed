export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) {
    console.warn('[SW] Service workers not supported');
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });
    console.log('[SW] Registered with scope:', registration.scope);
    return registration;
  } catch (err) {
    console.error('[SW] Registration failed:', err);
    return null;
  }
}
