<script lang="ts">
  interface Props {
    updatedAt: number;
    model: string;
    onContinue: () => void;
    onDismiss: () => void;
  }

  const { updatedAt, model, onContinue, onDismiss }: Props = $props();

  const updatedLabel = $derived(new Date(updatedAt).toLocaleString());
</script>

<div class="continue-banner" role="region" aria-label="Continue previous conversation">
  <div class="continue-banner-content">
    <strong>Continue your conversation</strong>
    <p>Last active on {updatedLabel} · {model}</p>
  </div>
  <div class="continue-banner-actions">
    <button type="button" class="continue-btn" onclick={onContinue}>Continue</button>
    <button type="button" class="dismiss-btn" onclick={onDismiss}>Dismiss</button>
  </div>
</div>

<style>
  .continue-banner {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: var(--sp-2);
    border: 1px solid var(--mode-border, var(--border-accent));
    background: var(--mode-banner-bg, rgba(137, 87, 229, 0.08));
    border-radius: var(--radius-md);
    padding: var(--sp-3);
    margin-bottom: var(--sp-3);
  }

  .continue-banner-content {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
  }

  .continue-banner-content p {
    margin: 0;
    color: var(--fg-muted);
    font-size: 0.85rem;
  }

  .continue-banner-actions {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }

  .continue-btn,
  .dismiss-btn {
    min-height: 36px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: var(--bg-overlay);
    color: var(--fg);
    padding: 0 var(--sp-3);
    cursor: pointer;
  }

  .continue-btn {
    border-color: var(--mode-border, var(--border-accent));
  }
</style>
