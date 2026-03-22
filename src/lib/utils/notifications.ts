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

import { subscribeToPush, isPushSupported } from './push-notifications.js';

export interface NotifyOptions {
  body?: string;
  tag?: string;
  /** `true` for blocking events (approval, user input); `false` for informational ones. */
  requireInteraction?: boolean;
  /** Skip the `document.hidden` check — notify even when the tab is visible.
   *  Use for results that arrive after user interaction (e.g. tool approval). */
  force?: boolean;
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
 * When `opts.force` is true, fires regardless of visibility (used after tool approval).
 * Permission is requested lazily on the first call when status is `'default'`.
 */
export function notify(title: string, opts: NotifyOptions = {}): void {
  if (typeof document === 'undefined' || typeof Notification === 'undefined') return;
  if (!opts.force && !document.hidden) return;

  if (Notification.permission === 'granted') {
    fireNotification(title, opts);
  } else if (Notification.permission === 'default') {
    Notification.requestPermission().then((perm) => {
      if (perm === 'granted') {
        fireNotification(title, opts);

        // Also set up push subscription for when the browser is closed
        if (isPushSupported()) {
          subscribeToPush().catch(() => {});
        }
      }
    });
  }
  // 'denied' → silently no-op
}
