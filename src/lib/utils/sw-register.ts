const SW_VERSION = '2026-03-25-2';

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) {
    console.warn('[SW] Service workers not supported');
    return null;
  }

  try {
    let reloadedForControllerChange = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloadedForControllerChange) return;
      reloadedForControllerChange = true;
      window.location.reload();
    });

    const registration = await navigator.serviceWorker.register(`/sw.js?v=${SW_VERSION}`, {
      scope: '/',
    });
    await registration.update();
    console.log('[SW] Registered with scope:', registration.scope);
    return registration;
  } catch (err) {
    console.error('[SW] Registration failed:', err);
    return null;
  }
}
