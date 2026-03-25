export interface QuotaSnapshot {
  remainingPercentage?: number;
  percentageUsed?: number;
  resetDate?: string;
  usedRequests?: number;
  entitlementRequests?: number;
  overage?: number;
  isUnlimitedEntitlement?: boolean;
}

export type QuotaSnapshots = Record<string, QuotaSnapshot>;

/** Priority order for picking the most relevant quota snapshot */
const QUOTA_PRIORITY = ['copilot_premium', 'premium_requests', 'premium_interactions'] as const;

/** Pick the most relevant quota snapshot: premium types first, then any other key */
export function pickPrimaryQuota(snapshots: QuotaSnapshots | null): { key: string; label: string; snapshot: QuotaSnapshot } | null {
  if (!snapshots) return null;
  const keys = Object.keys(snapshots);
  if (keys.length === 0) return null;

  for (const k of QUOTA_PRIORITY) {
    if (snapshots[k]) return { key: k, label: formatQuotaLabel(k), snapshot: snapshots[k] };
  }
  const k = keys[0];
  return { key: k, label: formatQuotaLabel(k), snapshot: snapshots[k] };
}

function formatQuotaLabel(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
