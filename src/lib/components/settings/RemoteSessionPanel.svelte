<script lang="ts">
  import type { RemoteSessionMode } from '$lib/types/index.js';

  interface Props {
    remoteSessionMode: RemoteSessionMode;
    onSetRemoteSessionMode: (mode: RemoteSessionMode) => void;
    /** Whether a session is currently active (enables "apply now") */
    sessionActive?: boolean;
    /** Apply the selected mode to the active session immediately */
    onApplyToSession?: (mode: RemoteSessionMode) => void;
  }

  const {
    remoteSessionMode,
    onSetRemoteSessionMode,
    sessionActive = false,
    onApplyToSession,
  }: Props = $props();

  const MODES: Array<{ value: RemoteSessionMode; label: string; hint: string }> = [
    { value: 'off', label: 'Off', hint: 'Sessions stay local to this server.' },
    { value: 'export', label: 'Export', hint: 'Publish a read-only copy to github.com.' },
    { value: 'on', label: 'Full remote', hint: 'Publish and allow steering from github.com.' },
  ];
</script>

<p class="settings-hint">
  Remote sessions publish your conversation to github.com so you can view or steer it from other devices.
  This setting applies to new sessions.
</p>

<div class="mode-group" role="radiogroup" aria-label="Remote session mode">
  {#each MODES as mode (mode.value)}
    <label class="mode-option" class:selected={remoteSessionMode === mode.value}>
      <input
        type="radio"
        name="remote-session-mode"
        value={mode.value}
        checked={remoteSessionMode === mode.value}
        onchange={() => onSetRemoteSessionMode(mode.value)}
      />
      <span class="mode-label">{mode.label}</span>
      <span class="mode-hint">{mode.hint}</span>
    </label>
  {/each}
</div>

{#if sessionActive && onApplyToSession}
  <button class="action-btn" onclick={() => onApplyToSession(remoteSessionMode)}>
    Apply to current session
  </button>
{/if}

<style>
  .settings-hint {
    font-family: var(--font-mono);
    font-size: 0.75em;
    color: var(--fg-dim);
    margin-bottom: var(--sp-2);
    line-height: 1.5;
  }

  .mode-group {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    margin-bottom: var(--sp-2);
  }

  .mode-option {
    display: grid;
    grid-template-columns: auto auto 1fr;
    align-items: baseline;
    gap: var(--sp-2);
    padding: var(--sp-1) var(--sp-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    cursor: pointer;
  }

  .mode-option.selected {
    border-color: var(--purple, #a78bfa);
    background: var(--bg-overlay);
  }

  .mode-option input {
    accent-color: var(--purple, #a78bfa);
  }

  .mode-label {
    font-size: 0.85em;
    color: var(--fg);
    font-weight: 600;
    white-space: nowrap;
  }

  .mode-hint {
    font-family: var(--font-mono);
    font-size: 0.7em;
    color: var(--fg-dim);
    line-height: 1.4;
  }

  .action-btn {
    background: none;
    border: 1px solid var(--border);
    border-radius: 100px;
    color: var(--fg-dim);
    padding: var(--sp-1) var(--sp-2);
    font-family: var(--font-mono);
    font-size: 0.9em;
    cursor: pointer;
    white-space: nowrap;
    min-height: 26px;
    display: flex;
    align-items: center;
    gap: var(--sp-1);
  }

  .action-btn:hover {
    color: var(--fg);
  }
</style>
