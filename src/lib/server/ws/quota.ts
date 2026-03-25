/** Normalize SDK quota snapshots: convert remainingPercentage from 0.0–1.0 to 0–100 and add percentageUsed */
export function normalizeQuotaSnapshots(raw: Record<string, any> | undefined): Record<string, any> | undefined {
  if (!raw) return raw;
  console.log('[QUOTA] raw SDK snapshots:', JSON.stringify(raw));
  const result: Record<string, any> = {};
  for (const [key, snap] of Object.entries(raw)) {
    const remaining = snap.remainingPercentage;
    const normalizedRemaining = remaining != null && remaining <= 1 ? remaining * 100 : remaining;
    result[key] = {
      ...snap,
      remainingPercentage: normalizedRemaining,
      percentageUsed: normalizedRemaining != null ? 100 - normalizedRemaining : undefined,
    };
  }
  return result;
}
