<script lang="ts">
  import type { SourcedAgentInfo } from '$lib/types/index.js';
  import SourceBadge from '$lib/components/shared/SourceBadge.svelte';
  import { groupBySource } from '$lib/utils/customization-helpers.js';

  interface Props {
    agents: SourcedAgentInfo[];
    onSelectAgent: (name: string) => void;
    onDeselectAgent: () => void;
  }

  const { agents, onSelectAgent, onDeselectAgent }: Props = $props();

  function handleAgentClick(name: string) {
    const agent = agents.find(a => a.name === name);
    if (agent?.isSelected) {
      onDeselectAgent();
    } else {
      onSelectAgent(name);
    }
  }
</script>

<p class="settings-hint">
  Click an agent to activate it for the current session. The model will use the agent's system prompt for all subsequent messages. Click again to deactivate.
</p>
{#if agents.length === 0}
  <p class="settings-hint">No agents found. Add <code>.agent.md</code> files to <code>~/.copilot/agents/</code>.</p>
{:else}
  {#each [...groupBySource(agents).entries()] as [source, items] (source)}
    <div class="source-group">
      <div class="source-group-header"><SourceBadge {source} /> <span class="source-group-count">{items.length}</span></div>
      {#each items as agent (agent.name)}
        <button
          class="agent-item"
          class:active={agent.isSelected}
          onclick={() => handleAgentClick(agent.name)}
        >
          <span class="agent-name">{agent.displayName ?? agent.name}</span>
          {#if agent.description}
            <span class="agent-desc">{agent.description}</span>
          {/if}
          {#if agent.isSelected}
            <span class="agent-current">active</span>
          {/if}
        </button>
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
  .agent-item {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    padding: var(--sp-2) var(--sp-1);
    cursor: pointer;
    border: none;
    background: none;
    font: inherit;
    color: inherit;
    text-align: left;
    width: 100%;
    border-radius: var(--radius-sm);
    min-height: 36px;
  }
  .agent-item:active {
    background: var(--bg-overlay);
  }
  .agent-item.active {
    background: rgba(210, 168, 255, 0.08);
    border: 1px solid var(--border-accent);
  }
  .agent-name {
    font-size: 0.85em;
    color: var(--fg);
    font-weight: 500;
  }
  .agent-desc {
    font-size: 0.75em;
    color: var(--fg-dim);
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .agent-current {
    font-size: 0.72em;
    color: var(--green);
    flex-shrink: 0;
  }
</style>
