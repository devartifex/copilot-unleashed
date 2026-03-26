<script lang="ts">
  import { pickPrimaryQuota, type QuotaSnapshots, type SessionUsageTotals, type SessionSummary } from '$lib/types/index.js';
  import { SquarePen, History, Settings, LogOut, X, PanelLeftClose, PanelLeftOpen } from 'lucide-svelte';

  interface Props {
    open: boolean;
    collapsed: boolean;
    currentAgent: string | null;
    quotaSnapshots: QuotaSnapshots | null;
    sessionTotals: SessionUsageTotals;
    sessions: SessionSummary[];
    onClose: () => void;
    onNewChat: () => void;
    onOpenSessions: () => void;
    onOpenSettings: () => void;
    onLogout: () => void;
    onToggleCollapse: () => void;
    onResumeSession: (sessionId: string) => void;
  }

  const {
    open,
    collapsed,
    currentAgent,
    quotaSnapshots,
    sessionTotals,
    sessions,
    onClose,
    onNewChat,
    onOpenSessions,
    onOpenSettings,
    onLogout,
    onToggleCollapse,
    onResumeSession,
  }: Props = $props();

  const recentSessions = $derived(
    [...sessions]
      .sort((a, b) => {
        const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return tb - ta;
      })
      .slice(0, 8),
  );

  const quotaInfo = $derived.by(() => {
    const primary = pickPrimaryQuota(quotaSnapshots);
    if (!primary) return null;
    const { label, snapshot } = primary;

    const resetLabel = snapshot.resetDate
      ? `Resets ${new Date(snapshot.resetDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
      : null;

    if (snapshot.isUnlimitedEntitlement) {
      return { unlimited: true as const, label, used: snapshot.usedRequests ?? 0, resetLabel };
    }

    const pct = snapshot.percentageUsed ?? (snapshot.remainingPercentage != null ? 100 - snapshot.remainingPercentage : null);
    if (pct == null) return null;

    const color = pct > 80 ? 'red' : pct >= 50 ? 'yellow' : 'green';
    return { unlimited: false as const, label, pct: Math.round(pct), color, resetLabel, used: snapshot.usedRequests, total: snapshot.entitlementRequests };
  });

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  function handleEscapeKey(e: KeyboardEvent) {
    if (open && e.key === 'Escape') onClose();
  }

  function formatRelativeTime(dateStr: string | undefined): string {
    if (!dateStr) return '';
    const diffMs = Date.now() - new Date(dateStr).getTime();
    if (Number.isNaN(diffMs)) return '';
    const min = Math.floor(diffMs / 60_000);
    const hr = Math.floor(min / 60);
    const day = Math.floor(hr / 24);
    if (min < 1) return 'now';
    if (min < 60) return `${min}m`;
    if (hr < 24) return `${hr}h`;
    return `${day}d`;
  }
</script>

<svelte:window onkeydown={handleEscapeKey} />

<!-- Mobile overlay: only renders when open on mobile -->
{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
  <div class="sidebar-backdrop" role="presentation" onclick={handleBackdropClick}></div>
{/if}

<aside class="sidebar" class:open class:collapsed aria-label="Sidebar navigation">
  <div class="sidebar-header">
    {#if !collapsed}
      <span class="sidebar-title">Menu</span>
    {/if}
    <!-- Desktop collapse toggle -->
    <button class="sidebar-toggle desktop-only" onclick={onToggleCollapse} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
      {#if collapsed}
        <PanelLeftOpen size={18} />
      {:else}
        <PanelLeftClose size={18} />
      {/if}
    </button>
    <!-- Mobile close -->
    <button class="sidebar-close mobile-only" onclick={onClose} aria-label="Close sidebar">
      <X size={20} />
    </button>
  </div>

  <div class="sidebar-body">
    <!-- New Chat CTA -->
    <button class="new-chat-btn" onclick={onNewChat} title="New Chat" aria-label="New Chat">
      <SquarePen size={18} />
      {#if !collapsed}<span>New Chat</span>{/if}
    </button>

    <!-- Actions section -->
    <div class="sidebar-section">
      <button class="sidebar-action" onclick={onOpenSessions} title="Sessions" aria-label="Sessions">
        <History size={18} />
        {#if !collapsed}<span>Sessions</span>{/if}
      </button>
      <button class="sidebar-action" onclick={onOpenSettings} title="Settings" aria-label="Settings">
        <Settings size={18} />
        {#if !collapsed}<span>Settings</span>{/if}
      </button>
    </div>

    {#if !collapsed}
      {#if currentAgent}
        <div class="sidebar-section">
          <span class="sidebar-label">Agent</span>
          <span class="sidebar-agent-name">{currentAgent}</span>
        </div>
      {/if}

      {#if quotaInfo}
        <div class="sidebar-section">
          <span class="sidebar-label">{quotaInfo.label}</span>
          {#if quotaInfo.unlimited}
            <div class="quota-details">
              <span class="quota-pct">Unlimited</span>
              {#if quotaInfo.used != null}
                <span class="quota-counts">{quotaInfo.used} used</span>
              {/if}
            </div>
          {:else}
            <div class="quota-bar-track">
              <div class="quota-bar-fill {quotaInfo.color}" style="width: {quotaInfo.pct}%"></div>
            </div>
            <div class="quota-details">
              <span class="quota-pct">{quotaInfo.pct}% used</span>
              {#if quotaInfo.used != null && quotaInfo.total != null}
                <span class="quota-counts">{quotaInfo.used}/{quotaInfo.total}</span>
              {/if}
            </div>
          {/if}
          {#if quotaInfo.resetLabel}
            <span class="quota-reset">{quotaInfo.resetLabel}</span>
          {/if}
        </div>
      {/if}

      {#if sessionTotals.apiCalls > 0}
        <div class="sidebar-section">
          <span class="sidebar-label">Session Usage</span>
          <div class="session-totals">
            <span class="totals-line">in: {sessionTotals.inputTokens.toLocaleString()} · out: {sessionTotals.outputTokens.toLocaleString()}</span>
            {#if sessionTotals.reasoningTokens > 0}
              <span class="totals-line">reasoning: {sessionTotals.reasoningTokens.toLocaleString()}</span>
            {/if}
            {#if sessionTotals.cacheReadTokens > 0 || sessionTotals.cacheWriteTokens > 0}
              <span class="totals-line">cache r: {sessionTotals.cacheReadTokens.toLocaleString()} · w: {sessionTotals.cacheWriteTokens.toLocaleString()}</span>
            {/if}
            <span class="totals-line">{sessionTotals.apiCalls} API calls · cost: {sessionTotals.totalCost}×</span>
            {#if sessionTotals.totalDurationMs > 0}
              <span class="totals-line">{(sessionTotals.totalDurationMs / 1000).toFixed(1)}s total API time</span>
            {/if}
            {#if sessionTotals.premiumRequests > 0}
              <span class="totals-line">{sessionTotals.premiumRequests} premium requests</span>
            {/if}
          </div>
        </div>
      {/if}

      <!-- Desktop embedded sessions -->
      {#if recentSessions.length > 0}
        <div class="sidebar-section desktop-only">
          <span class="sidebar-label">Recent Sessions</span>
          <div class="session-mini-list">
            {#each recentSessions as session (session.id)}
              <button class="session-mini-item" onclick={() => onResumeSession(session.id)} title={session.title ?? session.id}>
                <span class="session-mini-title">{session.title ?? session.id}</span>
                {#if session.repository || session.updatedAt}
                  <span class="session-mini-meta">
                    {#if session.repository}<span>{session.repository}</span>{/if}
                    {#if session.updatedAt}<span>{formatRelativeTime(session.updatedAt)}</span>{/if}
                  </span>
                {/if}
              </button>
            {/each}
          </div>
        </div>
      {/if}
    {/if}

    <div class="sidebar-spacer"></div>

    <div class="sidebar-divider"></div>

    <!-- Sign out -->
    <div class="sidebar-section">
      <button class="sidebar-action sidebar-action-danger" onclick={onLogout} title="Sign Out" aria-label="Sign Out">
        <LogOut size={18} />
        {#if !collapsed}<span>Sign Out</span>{/if}
      </button>
    </div>
  </div>
</aside>

<style>
  /* ── Sidebar base ───────────────────────────────────────────── */
  .sidebar {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    width: min(280px, 80vw);
    background: var(--bg-raised);
    border-right: 1px solid var(--border);
    z-index: 91;
    display: flex;
    flex-direction: column;
    transform: translateX(-100%);
    visibility: hidden;
    transition: transform var(--duration-normal) var(--ease-default),
                width var(--duration-normal) var(--ease-default),
                visibility 0s var(--duration-normal);
    padding-top: env(safe-area-inset-top);
    padding-bottom: env(safe-area-inset-bottom);
  }

  .sidebar.open {
    transform: translateX(0);
    visibility: visible;
    transition: transform var(--duration-normal) var(--ease-default),
                width var(--duration-normal) var(--ease-default),
                visibility 0s;
  }

  .sidebar-backdrop {
    position: fixed;
    inset: 0;
    z-index: 90;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(2px);
  }

  /* ── Header ─────────────────────────────────────────────────── */
  .sidebar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--sp-3) var(--sp-4);
    border-bottom: 1px solid var(--border);
    min-height: 48px;
  }
  .sidebar-title {
    font-size: 0.95em;
    font-weight: 600;
    color: var(--fg);
  }
  .sidebar-close, .sidebar-toggle {
    background: none;
    border: none;
    color: var(--fg-muted);
    cursor: pointer;
    padding: 4px;
    border-radius: var(--radius-sm);
    min-height: 36px;
    min-width: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background var(--duration-fast) var(--ease-default),
                color var(--duration-fast) var(--ease-default);
  }
  .sidebar-close:hover, .sidebar-toggle:hover { background: var(--bg-overlay); color: var(--fg); }
  .sidebar-close:active, .sidebar-toggle:active { background: var(--border); }

  /* ── Body ────────────────────────────────────────────────────── */
  .sidebar-body {
    flex: 1;
    overflow-y: auto;
    padding: var(--sp-3) var(--sp-4);
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    scrollbar-width: none;
  }
  .sidebar-body::-webkit-scrollbar { display: none; }

  .sidebar-spacer { flex: 1; }

  .sidebar-section {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }
  .sidebar-label {
    font-size: 0.75em;
    color: var(--fg-dim);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 600;
  }
  .sidebar-divider {
    height: 1px;
    background: var(--border);
  }

  /* ── New Chat CTA ───────────────────────────────────────────── */
  .new-chat-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--sp-2);
    background: var(--purple-dim);
    color: white;
    border: none;
    border-radius: var(--radius-sm);
    font-size: 0.88em;
    font-weight: 600;
    padding: var(--sp-2) var(--sp-3);
    min-height: 40px;
    width: 100%;
    cursor: pointer;
    transition: background var(--duration-fast) var(--ease-default),
                transform var(--duration-fast) var(--ease-default);
  }
  .new-chat-btn:hover { background: #7048c2; }
  .new-chat-btn:active { background: #5e3aa8; transform: scale(0.98); }

  /* ── Action buttons ─────────────────────────────────────────── */
  .sidebar-action {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    background: none;
    border: none;
    color: var(--fg);
    font-size: 0.88em;
    padding: var(--sp-2) var(--sp-1);
    border-radius: var(--radius-sm);
    cursor: pointer;
    min-height: 40px;
    width: 100%;
    text-align: left;
    transition: background var(--duration-fast) var(--ease-default);
  }
  .sidebar-action:hover { background: var(--bg-overlay); }
  .sidebar-action:active { background: var(--border); }
  .sidebar-action-danger { color: var(--red); }

  .sidebar-agent-name {
    font-size: 0.85em;
    color: var(--purple);
  }

  /* ── Quota bar ──────────────────────────────────────────────── */
  .quota-bar-track {
    height: 6px;
    background: var(--border);
    border-radius: 3px;
    overflow: hidden;
  }
  .quota-bar-fill {
    height: 100%;
    border-radius: 3px;
    transition: width 0.3s ease;
  }
  .quota-bar-fill.green { background: var(--green); }
  .quota-bar-fill.yellow { background: var(--yellow); }
  .quota-bar-fill.red { background: var(--red); }

  .quota-details {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .quota-pct {
    font-family: var(--font-mono);
    font-size: 0.78em;
    color: var(--fg-muted);
  }
  .quota-counts {
    font-family: var(--font-mono);
    font-size: 0.75em;
    color: var(--fg-dim);
  }
  .quota-reset {
    font-family: var(--font-mono);
    font-size: 0.72em;
    color: var(--fg-dim);
  }

  .session-totals {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .totals-line {
    font-family: var(--font-mono);
    font-size: 0.75em;
    color: var(--fg-dim);
  }

  /* ── Embedded session mini-list (desktop) ───────────────────── */
  .session-mini-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .session-mini-item {
    display: flex;
    flex-direction: column;
    gap: 1px;
    background: none;
    border: none;
    color: var(--fg);
    font-size: 0.82em;
    padding: var(--sp-1) var(--sp-2);
    border-radius: var(--radius-sm);
    cursor: pointer;
    text-align: left;
    width: 100%;
    transition: background var(--duration-fast) var(--ease-default);
  }
  .session-mini-item:hover { background: var(--bg-overlay); }
  .session-mini-item:active { background: var(--border); }
  .session-mini-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .session-mini-meta {
    display: flex;
    gap: var(--sp-2);
    font-size: 0.8em;
    color: var(--fg-dim);
  }

  /* ── Mobile/Desktop visibility helpers ──────────────────────── */
  .desktop-only { display: none; }
  .mobile-only { display: flex; }

  /* ── Desktop persistent mode (≥1024px) ──────────────────────── */
  @media (min-width: 1024px) {
    .sidebar-backdrop { display: none; }

    .sidebar {
      position: relative;
      transform: none;
      visibility: visible;
      width: 280px;
      flex-shrink: 0;
    }
    .sidebar.collapsed {
      width: 56px;
    }
    .sidebar.collapsed .sidebar-header {
      justify-content: center;
      padding: var(--sp-3) var(--sp-2);
    }
    .sidebar.collapsed .sidebar-body {
      padding: var(--sp-3) var(--sp-2);
      align-items: center;
    }
    .sidebar.collapsed .new-chat-btn {
      padding: var(--sp-2);
      width: 40px;
      height: 40px;
    }
    .sidebar.collapsed .sidebar-action {
      justify-content: center;
      padding: var(--sp-2);
    }

    .desktop-only { display: flex; }
    .mobile-only { display: none; }
  }
</style>
