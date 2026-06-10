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

/** Priority order for picking the most relevant quota snapshot (UBB AI Credits first, legacy premium keys for older accounts) */
const QUOTA_PRIORITY = ['ai_credits', 'aic', 'copilot_premium', 'premium_requests', 'premium_interactions'] as const;

/** Pick the most relevant quota snapshot: AI Credit / premium types first, then any other key */
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

/** Friendly display names under usage-based billing (UBB) */
const QUOTA_LABELS: Record<string, string> = {
  ai_credits: 'AI Credits (AIC)',
  aic: 'AI Credits (AIC)',
  // Legacy premium-request keys are surfaced as AI Credits in the UI
  copilot_premium: 'AI Credits (AIC)',
  premium_requests: 'AI Credits (AIC)',
  premium_interactions: 'AI Credits (AIC)',
  chat: 'Chat',
  completions: 'Completions',
};

function formatQuotaLabel(key: string): string {
  return QUOTA_LABELS[key] ?? key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
