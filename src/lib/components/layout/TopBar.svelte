<script lang="ts">
  import type { ConnectionState, QuotaSnapshots } from '$lib/types/index.js';
  import { Menu, ChevronDown } from 'lucide-svelte';
  import QuotaDot from '$lib/components/model/QuotaDot.svelte';

  interface Props {
    currentModel: string;
    connectionState: ConnectionState;
    sessionTitle: string | null;
    quotaSnapshots: QuotaSnapshots | null;
    modelSheetOpen?: boolean;
    onToggleSidebar: () => void;
    onOpenModelSheet: () => void;
  }

  const {
    currentModel,
    connectionState,
    sessionTitle,
    quotaSnapshots,
    modelSheetOpen = false,
    onToggleSidebar,
    onOpenModelSheet,
  }: Props = $props();

  const modelFamilyColor = $derived.by(() => {
    if (!currentModel) return 'var(--fg-dim)';
    if (currentModel.startsWith('gpt-')) return 'var(--green)';
    if (currentModel.startsWith('claude-')) return '#b07ee8';
    if (currentModel.startsWith('gemini-')) return 'var(--blue)';
    return 'var(--fg-dim)';
  });

  const displayModel = $derived(currentModel || 'Select model');
</script>

<div class="top-bar">
  <button class="tb-btn hamburger-btn" onclick={onToggleSidebar} aria-label="Open menu">
    <Menu size={20} />
  </button>

  {#if sessionTitle}
    <span class="title-text" title={sessionTitle}>{sessionTitle}</span>
  {:else}
    <span class="brand-group" aria-label="Copilot Unleashed">
      <img src="/img/logo-no-bg.svg" alt="" class="brand-icon" width="22" height="22" aria-hidden="true" />
      <span class="brand-name">Copilot <span class="brand-accent">Unleashed</span></span>
    </span>
  {/if}

  <button class="model-pill" class:open={modelSheetOpen} onclick={onOpenModelSheet} aria-label="Select model">
    <span class="family-dot" style:background={modelFamilyColor}></span>
    {#if currentModel}
      <span class="model-name">{displayModel}</span>
    {:else}
      <span class="model-name loading-text">{displayModel}</span>
    {/if}
    <QuotaDot {quotaSnapshots} />
    <span class="chevron-wrap" class:chevron-open={modelSheetOpen}>
      <ChevronDown size={14} />
    </span>
  </button>
</div>

<style>
  .top-bar {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    padding: var(--sp-2) var(--sp-3);
    padding-top: calc(var(--sp-2) + var(--safe-top));
    background: var(--bg);
    flex-shrink: 0;
    min-height: 48px;
  }

  .tb-btn {
    background: none;
    border: none;
    color: var(--fg-dim);
    padding: 0;
    cursor: pointer;
    min-height: 36px;
    min-width: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    flex-shrink: 0;
    -webkit-tap-highlight-color: transparent;
    transition: color 0.15s ease;
  }

  .tb-btn:hover {
    color: var(--fg);
  }

  .tb-btn:active {
    color: var(--fg);
    transform: scale(0.92);
  }

  /* ── Session title ──────────────────────────────────────────────── */
  .title-text {
    font-size: 0.82em;
    color: var(--fg-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
    flex: 1;
    font-weight: 500;
  }

  /* ── Brand group (shown when no session title) ── */
  .brand-group {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    flex: 1;
    overflow: hidden;
  }

  .brand-icon {
    flex-shrink: 0;
    border-radius: 4px;
    filter: drop-shadow(0 0 6px rgba(147, 51, 234, 0.55));
  }

  .brand-name {
    font-size: 0.95em;
    font-weight: 700;
    color: var(--fg);
    letter-spacing: 0.01em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .brand-accent {
    background: linear-gradient(90deg, #a78bfa, #22d3ee);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  /* Hide brand text on mobile, show only logo */
  @media (max-width: 767px) {
    .brand-name {
      display: none;
    }
  }

  /* ── Model pill ────────────────────────────────────────────────── */
  .model-pill {
    display: flex;
    align-items: center;
    gap: 6px;
    background: transparent;
    border: none;
    border-radius: var(--radius-md);
    padding: 6px 12px;
    cursor: pointer;
    min-height: 40px;
    max-width: 220px;
    -webkit-tap-highlight-color: transparent;
    transition: background 0.15s ease;
  }

  .model-pill:hover {
    background: var(--bg-overlay);
  }

  .model-pill:active,
  .model-pill.open {
    background: var(--border);
  }

  .model-name {
    font-size: 0.78em;
    color: var(--fg-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
    font-weight: 500;
  }

  @keyframes pulse-text {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 1; }
  }

  .model-name.loading-text {
    animation: pulse-text 1.5s ease-in-out infinite;
  }

  /* ── Chevron with rotation ─────────────────────────────────────── */
  .chevron-wrap {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    color: var(--fg-dim);
    opacity: 0.6;
    transition: transform 0.2s ease;
  }

  .chevron-wrap.chevron-open {
    transform: rotate(180deg);
  }

  /* ── Model family dot ──────────────────────────────────────────── */
  .family-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
    box-shadow: 0 0 4px currentColor;
  }

  /* ── Responsive ────────────────────────────────────────────────── */
  @media (min-width: 768px) {
    .top-bar {
      max-width: 800px;
      margin: 0 auto;
      width: 100%;
      padding-left: var(--sp-6);
      padding-right: var(--sp-6);
    }
  }

  @media (min-width: 1024px) {
    .hamburger-btn {
      display: none;
    }

    .top-bar {
      max-width: 880px;
    }
  }
</style>
