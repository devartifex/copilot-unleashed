<script lang="ts">
  import { Globe, X } from 'lucide-svelte';

  interface Props {
    /** github.com URL for the remote session */
    url: string;
    /** True when remote steering is enabled (not just export) */
    steerable?: boolean;
    onDismiss?: () => void;
  }

  const { url, steerable = false, onDismiss }: Props = $props();
</script>

<div class="remote-banner" role="status">
  <Globe size={14} aria-hidden="true" />
  <span class="remote-text">{steerable ? 'Remote session active' : 'Session exported'}</span>
  <a class="remote-link" href={url} target="_blank" rel="noopener noreferrer">
    Open on GitHub
  </a>
  {#if onDismiss}
    <button class="dismiss-btn" onclick={onDismiss} aria-label="Dismiss remote session banner">
      <X size={14} />
    </button>
  {/if}
</div>

<style>
  .remote-banner {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    padding: var(--sp-1) var(--sp-3);
    background: var(--bg-overlay);
    border-bottom: 1px solid var(--border);
    color: var(--fg-dim);
    font-family: var(--font-mono);
    font-size: 0.72em;
    flex-shrink: 0;
  }

  .remote-text {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .remote-link {
    color: var(--purple, #a78bfa);
    text-decoration: none;
    white-space: nowrap;
    margin-left: auto;
  }

  .remote-link:hover,
  .remote-link:focus-visible {
    text-decoration: underline;
  }

  .dismiss-btn {
    background: none;
    border: none;
    color: var(--fg-dim);
    padding: 4px;
    cursor: pointer;
    display: flex;
    align-items: center;
    border-radius: var(--radius-sm);
  }

  .dismiss-btn:hover {
    color: var(--fg);
  }

  @media (min-width: 768px) {
    .remote-banner {
      max-width: 800px;
      margin: 0 auto;
      width: 100%;
    }
  }
</style>
