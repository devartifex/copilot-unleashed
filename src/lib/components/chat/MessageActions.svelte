<script lang="ts">
  import type { TtsStore } from '$lib/stores/tts.svelte.js';

  interface Props {
    messageId: string;
    content: string;
    tts: TtsStore;
  }

  const { messageId, content, tts }: Props = $props();

  const isThisPlaying = $derived(tts.playingMessageId === messageId && !tts.isPaused);
  const isThisPaused = $derived(tts.playingMessageId === messageId && tts.isPaused);

  let copyLabel = $state('Copy');

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(content);
      copyLabel = 'Copied!';
      setTimeout(() => { copyLabel = 'Copy'; }, 1500);
    } catch {
      copyLabel = 'Failed';
      setTimeout(() => { copyLabel = 'Copy'; }, 1500);
    }
  }

  function handleTts() {
    tts.toggle(messageId, content);
  }
</script>

<div class="message-actions" role="toolbar" aria-label="Message actions">
  <!-- Copy full message -->
  <button
    class="action-btn"
    onclick={handleCopy}
    aria-label={copyLabel}
  >
    {#if copyLabel === 'Copied!'}
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M3 8.5 L6.5 12 L13 4"/>
      </svg>
    {:else}
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="5" y="5" width="9" height="9" rx="1.5"/>
        <path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5"/>
      </svg>
    {/if}
    <span class="action-label">{copyLabel}</span>
  </button>

  <!-- Read aloud -->
  {#if tts.supported}
    <button
      class="action-btn"
      class:active={isThisPlaying}
      onclick={handleTts}
      aria-label={isThisPlaying ? 'Stop reading' : isThisPaused ? 'Resume reading' : 'Read aloud'}
      aria-pressed={isThisPlaying || isThisPaused}
    >
      {#if isThisPlaying}
        <!-- Stop/square icon while playing -->
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <rect x="3" y="3" width="10" height="10" rx="2"/>
        </svg>
        <span class="action-label">Stop</span>
      {:else if isThisPaused}
        <!-- Play icon to resume -->
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M4 2.5 L13 8 L4 13.5Z"/>
        </svg>
        <span class="action-label">Resume</span>
      {:else}
        <!-- Speaker icon -->
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M8 3 L4 6 H1 V10 H4 L8 13Z"/>
          <path d="M11 5.5a4 4 0 0 1 0 5"/>
          <path d="M13 3.5a7 7 0 0 1 0 9"/>
        </svg>
        <span class="action-label">Read</span>
      {/if}
    </button>
  {/if}
</div>

<style>
  .message-actions {
    display: flex;
    align-items: center;
    gap: var(--sp-1);
    padding-top: var(--sp-1);
    opacity: 0;
    transition: opacity 0.15s ease;
  }

  /* Show on hover/focus or when TTS is active */
  :global(.message.assistant:hover) .message-actions,
  :global(.message.assistant:focus-within) .message-actions,
  .message-actions:has(.active) {
    opacity: 1;
  }

  /* Always visible on touch devices */
  @media (hover: none) {
    .message-actions {
      opacity: 1;
    }
  }

  .action-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    color: var(--fg-dim);
    font-size: 0.72em;
    padding: 3px 8px;
    cursor: pointer;
    transition: all 0.12s ease;
    -webkit-tap-highlight-color: transparent;
    min-height: 26px;
  }

  .action-btn:hover {
    background: var(--border);
    color: var(--fg);
  }

  .action-btn:active {
    transform: scale(0.95);
  }

  .action-btn.active {
    color: var(--purple);
  }

  .action-label {
    white-space: nowrap;
  }
</style>
