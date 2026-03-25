<script lang="ts">
  import type { ToolInfo } from '$lib/types/index.js';

  interface Props {
    tools: ToolInfo[];
    excludedTools: string[];
    onToggleTool: (toolName: string, enabled: boolean) => void;
  }

  const { tools, excludedTools, onToggleTool }: Props = $props();

  const groupedTools = $derived.by(() => {
    const groups = new Map<string, ToolInfo[]>();
    for (const tool of tools) {
      const server = tool.mcpServerName ?? 'built-in';
      const list = groups.get(server) ?? [];
      list.push(tool);
      groups.set(server, list);
    }
    return groups;
  });

  function isToolEnabled(toolName: string): boolean {
    return !excludedTools.includes(toolName);
  }

  function handleToolToggle(toolName: string, e: Event) {
    const target = e.target as HTMLInputElement;
    onToggleTool(toolName, target.checked);
  }
</script>

{#if tools.length === 0}
  <p class="settings-hint">No tools available.</p>
{:else}
  {#each [...groupedTools.entries()] as [server, serverTools] (server)}
    <div class="tools-group">
      <div class="tools-group-header">{server}</div>
      {#each serverTools as tool (tool.namespacedName ?? tool.name)}
        <div class="tool-item">
          <label class="tool-toggle-label">
            <input
              type="checkbox"
              class="tool-toggle-check"
              checked={isToolEnabled(tool.namespacedName ?? tool.name)}
              onchange={(e: Event) => handleToolToggle(tool.namespacedName ?? tool.name, e)}
            />
            <span class="tool-toggle-name">{tool.name}</span>
          </label>
          {#if tool.description}
            <div class="tool-toggle-desc">{tool.description}</div>
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
  .tools-group {
    margin-bottom: var(--sp-3);
  }
  .tools-group-header {
    font-size: 0.75em;
    color: var(--purple);
    font-weight: 600;
    margin-bottom: var(--sp-1);
    text-transform: uppercase;
  }
  .tool-item {
    padding: var(--sp-1) 0;
    border-bottom: 1px solid rgba(48, 54, 61, 0.5);
  }
  .tool-item:last-child {
    border-bottom: none;
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
  .tool-toggle-name {
    font-size: 0.82em;
    color: var(--fg);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tool-toggle-desc {
    font-size: 0.72em;
    color: var(--fg-dim);
    padding-left: 24px;
    margin-top: 1px;
  }
</style>
