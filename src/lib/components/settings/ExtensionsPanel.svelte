<script lang="ts">
  import { RefreshCw } from 'lucide-svelte';

  interface ExtensionInfo {
    name: string;
    description?: string;
    enabled: boolean;
  }

  interface Props {
    extensions: ExtensionInfo[];
    loading?: boolean;
    onToggleExtension: (name: string, enabled: boolean) => void;
    onReloadExtensions: () => void;
  }

  const { extensions, loading = false, onToggleExtension, onReloadExtensions }: Props = $props();
</script>

<div class="extensions-header">
  <p class="settings-hint">
    Extensions are additional capabilities discovered by the Copilot CLI. Toggle to enable or disable.
  </p>
  <button class="reload-btn" onclick={onReloadExtensions} aria-label="Reload extensions">
    <RefreshCw size={14} />
  </button>
</div>
{#if loading}
  <div class="skeleton-list">
    <div class="skeleton skeleton-row"></div>
    <div class="skeleton skeleton-row"></div>
    <div class="skeleton skeleton-row"></div>
  </div>
{:else if extensions.length === 0}
  <p class="settings-hint">No extensions available. Start a session first.</p>
{:else}
  {#each extensions as ext (ext.name)}
    <div class="customization-item">
      <label class="tool-toggle-label">
        <input
          type="checkbox"
          class="tool-toggle-check"
          checked={ext.enabled}
          onchange={() => onToggleExtension(ext.name, !ext.enabled)}
        />
        <span class="customization-name">{ext.name}</span>
      </label>
      {#if ext.description}
        <p class="customization-desc">{ext.description}</p>
      {/if}
    </div>
  {/each}
{/if}

<style>
  .extensions-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--sp-2);
  }
  .reload-btn {
    background: none;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--fg-dim);
    cursor: pointer;
    padding: var(--sp-1);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .reload-btn:hover {
    color: var(--fg);
    border-color: var(--fg-dim);
  }
  .settings-hint {
    font-family: var(--font-mono);
    font-size: 0.75em;
    color: var(--fg-dim);
    margin-bottom: var(--sp-2);
    line-height: 1.5;
  }
  .skeleton-list {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    padding: var(--sp-1) 0;
  }
  .skeleton-row {
    height: 28px;
    width: 100%;
  }
  .customization-item {
    padding: var(--sp-1) 0;
    border-bottom: 1px solid rgba(48, 54, 61, 0.5);
  }
  .customization-item:last-child {
    border-bottom: none;
  }
  .customization-name {
    font-size: 0.82em;
    color: var(--fg);
    font-weight: 500;
  }
  .customization-desc {
    font-size: 0.72em;
    color: var(--fg-dim);
    margin: var(--sp-1) 0 0 calc(16px + var(--sp-2));
    line-height: 1.4;
  }
  .tool-toggle-label {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    cursor: pointer;
    min-height: 28px;
  }
  .tool-toggle-check {
    accent-color: var(--green);
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }
</style>
