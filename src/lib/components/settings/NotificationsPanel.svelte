<script lang="ts">
  import {
    isPushSupported,
    isStandalone,
    subscribeToPush,
    unsubscribeFromPush,
    getPushSubscription,
  } from '$lib/utils/push-notifications.js';

  interface Props {
    notificationsEnabled: boolean;
    onToggleNotifications: (enabled: boolean) => void;
  }

  const { notificationsEnabled, onToggleNotifications }: Props = $props();

  type NotificationStatus = 'unsupported' | 'not-standalone-ios' | 'denied' | 'prompt' | 'subscribed' | 'granted-no-push' | 'loading';

  let notificationStatus = $state<NotificationStatus>('loading');
  let notificationBusy = $state(false);

  function isIos(): boolean {
    if (typeof navigator === 'undefined') return false;
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  async function refreshNotificationStatus(): Promise<void> {
    if (typeof window === 'undefined') { notificationStatus = 'unsupported'; return; }
    if (!isPushSupported()) {
      if (isIos() && !isStandalone()) {
        notificationStatus = 'not-standalone-ios';
      } else {
        notificationStatus = 'unsupported';
      }
      return;
    }
    if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
      notificationStatus = 'denied';
      if (notificationsEnabled) onToggleNotifications(false);
      return;
    }
    const sub = await getPushSubscription();
    if (sub) {
      notificationStatus = 'subscribed';
      if (!notificationsEnabled) onToggleNotifications(true);
      return;
    }
    if (notificationsEnabled && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        const vapidRes = await fetch('/api/push/vapid-key');
        if (!vapidRes.ok) {
          onToggleNotifications(false);
          notificationStatus = 'unsupported';
          return;
        }
      } catch {
        notificationStatus = 'granted-no-push';
        return;
      }
      notificationBusy = true;
      try {
        const newSub = await subscribeToPush();
        notificationStatus = newSub ? 'subscribed' : 'granted-no-push';
      } finally {
        notificationBusy = false;
      }
      return;
    }
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      notificationStatus = 'granted-no-push';
      return;
    }
    notificationStatus = 'prompt';
  }

  async function handleEnableNotifications(): Promise<void> {
    notificationBusy = true;
    try {
      const sub = await subscribeToPush();
      if (sub) {
        notificationStatus = 'subscribed';
        onToggleNotifications(true);
      } else if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
        notificationStatus = 'denied';
        onToggleNotifications(false);
      }
    } finally {
      notificationBusy = false;
    }
  }

  async function handleDisableNotifications(): Promise<void> {
    notificationBusy = true;
    try {
      await unsubscribeFromPush();
      notificationStatus = 'prompt';
      onToggleNotifications(false);
    } finally {
      notificationBusy = false;
    }
  }

  // Refresh notification status when panel mounts (accordion opens)
  $effect(() => {
    refreshNotificationStatus();
  });
</script>

{#if notificationStatus === 'loading'}
  <p class="settings-hint">Checking notification status…</p>
{:else if notificationStatus === 'unsupported'}
  <p class="settings-hint">Push notifications are not supported in this browser.</p>
{:else if notificationStatus === 'not-standalone-ios'}
  <p class="settings-hint">
    To enable notifications on iOS, install this app first:
    tap the <strong>Share</strong> button, then <strong>Add to Home Screen</strong>.
  </p>
{:else if notificationStatus === 'denied'}
  <p class="settings-hint">
    Notification permission was blocked. To re-enable, open your browser or device settings and allow notifications for this site.
  </p>
{:else if notificationStatus === 'subscribed'}
  <p class="settings-hint">Push notifications are enabled. You'll be notified when responses arrive while the app is in the background.</p>
  <button class="action-btn" onclick={handleDisableNotifications} disabled={notificationBusy}>
    {notificationBusy ? 'Disabling…' : 'Disable Notifications'}
  </button>
{:else if notificationStatus === 'granted-no-push'}
  <p class="settings-hint">Notifications are allowed but push is not set up. Tap below to enable push notifications.</p>
  <button class="action-btn" onclick={handleEnableNotifications} disabled={notificationBusy}>
    {notificationBusy ? 'Enabling…' : 'Enable Push Notifications'}
  </button>
{:else}
  <p class="settings-hint">Get notified when responses arrive while the app is in the background.</p>
  <button class="action-btn" onclick={handleEnableNotifications} disabled={notificationBusy}>
    {notificationBusy ? 'Enabling…' : 'Enable Notifications'}
  </button>
{/if}

<style>
  .settings-hint {
    font-family: var(--font-mono);
    font-size: 0.75em;
    color: var(--fg-dim);
    margin-bottom: var(--sp-2);
    line-height: 1.5;
  }
  .action-btn {
    background: none;
    border: 1px solid var(--border);
    border-radius: 100px;
    color: var(--fg-dim);
    padding: var(--sp-1) var(--sp-2);
    font-family: var(--font-mono);
    font-size: 0.9em;
    cursor: pointer;
    white-space: nowrap;
    min-height: 26px;
    display: flex;
    align-items: center;
    gap: var(--sp-1);
  }
</style>
