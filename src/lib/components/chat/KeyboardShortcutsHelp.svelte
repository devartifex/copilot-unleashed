<script lang="ts">
  interface Props {
    showHelp: boolean;
  }

  let { showHelp = $bindable() }: Props = $props();
</script>

{#if showHelp}
  <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
  <div class="help-backdrop" onclick={() => showHelp = false} role="presentation"></div>
  <div class="help-overlay" role="dialog" aria-label="Keyboard shortcuts">
    <div class="help-header">
      <h2>Keyboard Shortcuts</h2>
      <button class="help-close" onclick={() => showHelp = false} aria-label="Close">×</button>
    </div>
    <div class="help-body">
      <div class="help-section">
        <h3>Commands</h3>
        <div class="help-row"><kbd>/</kbd><span>Open command palette</span></div>
        <div class="help-row"><kbd>@</kbd><span>Mention a file</span></div>
        <div class="help-row"><kbd>#</kbd><span>Reference an issue or PR</span></div>
        <div class="help-row"><kbd>?</kbd><span>Show this help</span></div>
      </div>
      <div class="help-section">
        <h3>Input</h3>
        <div class="help-row"><kbd>Enter</kbd><span>Send message</span></div>
        <div class="help-row"><kbd>Shift + Enter</kbd><span>New line</span></div>
        <div class="help-row"><kbd>Escape</kbd><span>Close menu / overlay</span></div>
      </div>
      <div class="help-section">
        <h3>Menus</h3>
        <div class="help-row"><kbd>↑ ↓</kbd><span>Navigate options</span></div>
        <div class="help-row"><kbd>Enter / Tab</kbd><span>Select option</span></div>
        <div class="help-row"><kbd>Escape</kbd><span>Dismiss</span></div>
      </div>
      <div class="help-section">
        <h3>Slash Commands</h3>
        <div class="help-row"><kbd>/ask</kbd><span>Ask mode</span></div>
        <div class="help-row"><kbd>/plan</kbd><span>Plan mode</span></div>
        <div class="help-row"><kbd>/agent</kbd><span>Agent mode</span></div>
        <div class="help-row"><kbd>/fleet</kbd><span>Parallel sub-agents</span></div>
        <div class="help-row"><kbd>/clear</kbd><span>New conversation</span></div>
        <div class="help-row"><kbd>/model</kbd><span>Switch model</span></div>
        <div class="help-row"><kbd>/compact</kbd><span>Compact context</span></div>
      </div>
    </div>
  </div>
{/if}

<style>
  .help-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 100;
  }

  .help-overlay {
    position: fixed;
    bottom: 80px;
    left: 50%;
    transform: translateX(-50%);
    width: min(480px, calc(100% - 2rem));
    background: var(--bg-raised, var(--bg-overlay));
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    z-index: 101;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    animation: helpIn 0.15s ease;
    max-height: 70vh;
    overflow-y: auto;
    scrollbar-width: thin;
  }

  @keyframes helpIn {
    from { opacity: 0; transform: translateX(-50%) translateY(4px); }
    to { opacity: 1; transform: translateX(-50%) translateY(0); }
  }

  .help-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--sp-3) var(--sp-4);
    border-bottom: 1px solid var(--border);
  }

  .help-header h2 {
    margin: 0;
    font-size: 1em;
    font-weight: 600;
    color: var(--fg);
  }

  .help-close {
    background: none;
    border: none;
    color: var(--fg-muted);
    font-size: 1.4em;
    cursor: pointer;
    padding: 0 var(--sp-1);
    line-height: 1;
  }

  .help-close:hover {
    color: var(--fg);
  }

  .help-body {
    padding: var(--sp-3) var(--sp-4);
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--sp-3);
  }

  @media (max-width: 480px) {
    .help-body {
      grid-template-columns: 1fr;
    }
  }

  .help-section h3 {
    margin: 0 0 var(--sp-2);
    font-size: 0.8em;
    font-weight: 600;
    color: var(--fg-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .help-row {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    padding: var(--sp-1) 0;
    font-size: 0.82em;
    color: var(--fg);
  }

  .help-row kbd {
    display: inline-block;
    min-width: 28px;
    padding: 2px 6px;
    background: var(--bg-overlay);
    border: 1px solid var(--border);
    border-radius: 4px;
    font-family: var(--font-mono);
    font-size: 0.85em;
    text-align: center;
    color: var(--purple);
    white-space: nowrap;
  }

  .help-row span {
    color: var(--fg-muted);
  }
</style>
