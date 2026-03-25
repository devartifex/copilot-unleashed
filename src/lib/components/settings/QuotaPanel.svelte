<script lang="ts">
  import type { QuotaSnapshots } from '$lib/types/index.js';
  import { pickPrimaryQuota } from '$lib/types/index.js';

  interface Props {
    quotaSnapshots: QuotaSnapshots | null;
  }

  const { quotaSnapshots }: Props = $props();

  const primaryQuota = $derived(pickPrimaryQuota(quotaSnapshots));

  const quotaPercentUsed = $derived(
    primaryQuota?.snapshot?.percentageUsed ?? 0,
  );

  const quotaBarColor = $derived(
    quotaPercentUsed > 90 ? 'red' : quotaPercentUsed > 70 ? 'yellow' : 'green',
  );

  function formatResetDate(dateStr: string | undefined): string {
    if (!dateStr) return '';
    try {
      return new Date(dateStr).toLocaleDateString();
    } catch {
      return dateStr;
    }
  }
</script>

{#if primaryQuota}
  <div class="quota-label">{primaryQuota.label}</div>
  {#if primaryQuota.snapshot.isUnlimitedEntitlement}
    <div class="quota-text">
      Unlimited
      {#if primaryQuota.snapshot.usedRequests != null}
        · {primaryQuota.snapshot.usedRequests} requests used
      {/if}
      {#if primaryQuota.snapshot.resetDate}
        · Resets {formatResetDate(primaryQuota.snapshot.resetDate)}
      {/if}
    </div>
  {:else}
    <div class="quota-bar-container">
      <div
        class="quota-bar {quotaBarColor}"
        style="width: {Math.min(quotaPercentUsed, 100)}%"
      ></div>
    </div>
    <div class="quota-text">
      {#if primaryQuota.snapshot.usedRequests != null && primaryQuota.snapshot.entitlementRequests != null}
        {primaryQuota.snapshot.usedRequests} / {primaryQuota.snapshot.entitlementRequests} requests used
      {:else}
        {quotaPercentUsed.toFixed(1)}% used
      {/if}
      {#if primaryQuota.snapshot.resetDate}
        · Resets {formatResetDate(primaryQuota.snapshot.resetDate)}
      {/if}
    </div>
    {#if primaryQuota.snapshot.overage != null && primaryQuota.snapshot.overage > 0}
      <div class="quota-text" style="color: var(--red); margin-top: var(--sp-1);">
        ⚠ {primaryQuota.snapshot.overage} overage requests
      </div>
    {/if}
  {/if}
{:else}
  <p class="settings-hint">No quota information available.</p>
{/if}

<style>
  .settings-hint {
    font-family: var(--font-mono);
    font-size: 0.75em;
    color: var(--fg-dim);
    margin-bottom: var(--sp-2);
    line-height: 1.5;
  }
  .quota-label {
    font-size: 0.82em;
    color: var(--fg-muted);
    margin-bottom: var(--sp-1);
  }
  .quota-bar-container {
    width: 100%;
    height: 8px;
    background: var(--bg);
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: var(--sp-1);
    border: 1px solid var(--border);
  }
  .quota-bar {
    height: 100%;
    border-radius: 4px;
    transition: width 0.5s ease;
  }
  .quota-bar.green {
    background: var(--green);
  }
  .quota-bar.yellow {
    background: var(--yellow);
  }
  .quota-bar.red {
    background: var(--red);
  }
  .quota-text {
    font-size: 0.75em;
    color: var(--fg-dim);
  }
</style>
