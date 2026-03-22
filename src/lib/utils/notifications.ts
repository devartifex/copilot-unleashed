/**
 * Thin wrapper around the Web Notifications API.
 *
 * Rules:
 * - Only fires when `document.hidden === true` (tab is not visible).
 * - Requests permission lazily on the first trigger, never on page load.
 * - Silently no-ops when `Notification.permission === 'denied'`.
 * - Deduplicates with `tag` so rapid events don't stack.
 * - Clicking any notification focuses the tab and closes the notification.
 */

export interface NotifyOptions {
  body?: string;
  tag?: string;
  /** `true` for blocking events (approval, user input); `false` for informational ones. */
  requireInteraction?: boolean;
}

function fireNotification(title: string, opts: NotifyOptions): void {
  const notif = new Notification(title, {
    body: opts.body,
    icon: '/favicon.png',
    tag: opts.tag,
    requireInteraction: opts.requireInteraction ?? false,
  });
  notif.onclick = () => {
    window.focus();
    notif.close();
  };
}

/**
 * Show a browser notification if the tab is hidden and permission allows it.
 * Permission is requested lazily on the first call when status is `'default'`.
 */
export function notify(title: string, opts: NotifyOptions = {}): void {
  if (typeof document === 'undefined' || typeof Notification === 'undefined') return;
  if (!document.hidden) return;

  if (Notification.permission === 'granted') {
    fireNotification(title, opts);
  } else if (Notification.permission === 'default') {
    Notification.requestPermission().then((perm) => {
      if (perm === 'granted') {
        fireNotification(title, opts);
      }
    });
  }
  // 'denied' → silently no-op
}
