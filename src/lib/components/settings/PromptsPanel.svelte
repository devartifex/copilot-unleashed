<script lang="ts">
  import type { PromptInfo } from '$lib/types/index.js';
  import SourceBadge from '$lib/components/shared/SourceBadge.svelte';
  import { groupBySource } from '$lib/utils/customization-helpers.js';

  interface Props {
    prompts: PromptInfo[];
  }

  const { prompts }: Props = $props();
</script>

<p class="settings-hint">
  Prompt templates from <code>~/.copilot/prompts/</code>. Type <code>/name</code> in the chat input to use one.
</p>
{#if prompts.length === 0}
  <p class="settings-hint">No prompt files found.</p>
{:else}
  {#each [...groupBySource(prompts).entries()] as [source, items] (source)}
    <div class="source-group">
      <div class="source-group-header"><SourceBadge {source} /> <span class="source-group-count">{items.length}</span></div>
      {#each items as prompt (prompt.name)}
        <div class="prompt-item">
          <span class="customization-name">{prompt.name}</span>
          {#if prompt.description}
            <p class="customization-desc">{prompt.description}</p>
          {/if}
        </div>
      {/each}
    </div>
  {/each}
{/if}

<style>
  .settings-hint {
    font-family: var(--font-mono);
    font-size: 0.75em;
    color: var(--fg-dim);
    margin-bottom: var(--sp-2);
    line-height: 1.5;
  }
  .source-group {
    margin-bottom: var(--sp-3);
  }
  .source-group-header {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin-bottom: var(--sp-1);
  }
  .source-group-count {
    font-size: 0.7em;
    color: var(--fg-dim);
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
  .prompt-item {
    padding: var(--sp-2) 0;
    border-bottom: 1px solid rgba(48, 54, 61, 0.5);
  }
  .prompt-item:last-child {
    border-bottom: none;
  }
  .prompt-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-2);
  }
  .use-btn {
    font-size: 0.75em;
    padding: 2px 8px;
    color: var(--green);
    border-color: rgba(63, 185, 80, 0.3);
    min-height: unset;
  }
</style>
