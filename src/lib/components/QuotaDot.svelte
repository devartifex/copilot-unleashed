<script lang="ts">
  import { pickPrimaryQuota, type QuotaSnapshots } from '$lib/types/index.js';

  interface Props {
    quotaSnapshots: QuotaSnapshots | null;
  }

  const { quotaSnapshots }: Props = $props();

  const primary = $derived(pickPrimaryQuota(quotaSnapshots));

  const dotColor = $derived.by(() => {
    if (!primary) return null;
    const s = primary.snapshot;
    if (s.isUnlimitedEntitlement) return 'green';
    const pct = s.percentageUsed ?? (s.remainingPercentage != null ? 100 - s.remainingPercentage : null);
    if (pct == null) return null;
    if (pct > 80) return 'red';
    if (pct >= 50) return 'yellow';
    return 'green';
  });

  const tooltipText = $derived.by(() => {
    if (!primary) return '';
    const s = primary.snapshot;
    if (s.isUnlimitedEntitlement) return `${primary.label}: Unlimited`;
    const pct = s.percentageUsed ?? (s.remainingPercentage != null ? 100 - s.remainingPercentage : 0);
    return `${primary.label}: ${Math.round(pct ?? 0)}% used`;
  });
</script>

{#if dotColor}
  <span class="quota-dot {dotColor}" title="{tooltipText}"></span>
{/if}

<style>
  .quota-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    display: inline-block;
    flex-shrink: 0;
  }

  .quota-dot.green {
    background: var(--green);
  }

  .quota-dot.yellow {
    background: var(--yellow);
  }

  .quota-dot.red {
    background: var(--red);
  }
</style>
