// ─── Shared enums & constants ───────────────────────────────────────────────
/** Priority order for picking the most relevant quota snapshot */
const QUOTA_PRIORITY = ['copilot_premium', 'premium_requests', 'premium_interactions'];
/** Pick the most relevant quota snapshot: premium types first, then any other key */
export function pickPrimaryQuota(snapshots) {
    if (!snapshots)
        return null;
    const keys = Object.keys(snapshots);
    if (keys.length === 0)
        return null;
    for (const k of QUOTA_PRIORITY) {
        if (snapshots[k])
            return { key: k, label: formatQuotaLabel(k), snapshot: snapshots[k] };
    }
    // Fallback: first available key
    const k = keys[0];
    return { key: k, label: formatQuotaLabel(k), snapshot: snapshots[k] };
}
function formatQuotaLabel(key) {
    return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
//# sourceMappingURL=index.js.map