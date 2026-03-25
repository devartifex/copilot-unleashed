<script lang="ts">
  interface Props {
    onCompact: () => void;
  }

  const { onCompact }: Props = $props();
</script>

<p class="settings-hint">
  Compact the conversation to reduce context size while preserving key information.
</p>
<button class="action-btn" onclick={onCompact}>Compact Now</button>

<style>
  .settings-hint {
    font-family: var(--font-mono);
    font-size: 0.75em;
    color: var(--fg-dim);
    margin-bottom: var(--sp-2);
    line-height: 1.5;
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
</style>
