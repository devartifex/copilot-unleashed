<script lang="ts">
  import type { InstructionInfo } from '$lib/types/index.js';
  import SourceBadge from '$lib/components/shared/SourceBadge.svelte';
  import { groupBySource } from '$lib/utils/customization-helpers.js';

  interface Props {
    instructions: InstructionInfo[];
    additionalInstructions: string;
    onSaveInstructions: (instructions: string) => void;
  }

  const { instructions, additionalInstructions, onSaveInstructions }: Props = $props();

  let instructionsDraft = $state('');

  $effect(() => {
    instructionsDraft = additionalInstructions;
  });

  function handleSaveInstructions() {
    onSaveInstructions(instructionsDraft);
  }
</script>

{#if instructions.length > 0}
  <p class="settings-hint">Instruction files from <code>~/.copilot/</code> are automatically applied at session creation. No action needed.</p>
  {#each [...groupBySource(instructions).entries()] as [source, items] (source)}
    <div class="source-group">
      <div class="source-group-header"><SourceBadge {source} /> <span class="source-group-count">{items.length}</span></div>
      {#each items as inst (inst.path)}
        <div class="customization-item">
          <span class="customization-name">{inst.name}</span>
          {#if inst.applyTo}
            <span class="customization-meta">{inst.applyTo}</span>
          {/if}
        </div>
      {/each}
    </div>
  {/each}
{:else}
  <p class="settings-hint">No instruction files found.</p>
{/if}
<div class="instructions-divider"></div>
<p class="settings-hint">Additional session instructions:</p>
<textarea
  class="settings-textarea"
  bind:value={instructionsDraft}
  placeholder="e.g. Always respond in TypeScript..."
  rows="4"
></textarea>
<div style="margin-top: var(--sp-2); display: flex; justify-content: flex-end;">
  <button class="action-btn save" onclick={handleSaveInstructions}>Save</button>
</div>

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
  .customization-meta {
    display: inline-block;
    font-size: 0.7em;
    color: var(--fg-dim);
    margin-left: var(--sp-2);
    padding: 1px 6px;
    background: var(--bg-overlay);
    border-radius: var(--radius-sm);
  }
  .instructions-divider {
    border-top: 1px solid var(--border);
    margin: var(--sp-3) 0;
  }
  .settings-textarea {
    width: 100%;
    background: var(--bg);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: var(--sp-2) var(--sp-3);
    font-family: var(--font-mono);
    font-size: 0.85em;
    line-height: 1.5;
    resize: vertical;
    min-height: 60px;
    max-height: 200px;
    outline: none;
  }
  .settings-textarea:focus {
    border-color: var(--purple);
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
  .action-btn.save {
    color: var(--purple);
    border-color: var(--purple-dim);
  }
</style>
