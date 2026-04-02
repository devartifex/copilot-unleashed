<script lang="ts">
  import type { ToolInfo, SourcedMcpServerInfo } from '$lib/types/index.js';

  interface Props {
    discoveredMcpServers: SourcedMcpServerInfo[];
    tools: ToolInfo[];
    loading?: boolean;
  }

  const { discoveredMcpServers, tools, loading = false }: Props = $props();

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

  function getMcpTools(serverName: string): ToolInfo[] {
    return groupedTools.get(serverName) ?? [];
  }
</script>

<p class="settings-hint">
  MCP servers are configured in <code>~/.copilot/mcp-config.json</code>. Their tools become available to the model automatically.
</p>
<!-- Built-in GitHub server (non-removable) -->
<div class="mcp-server-item">
  <div class="mcp-server-header">
    <span class="mcp-server-name">GitHub</span>
    <span class="mcp-server-badge">built-in</span>
  </div>
  <div class="tool-toggle-desc">api.githubcopilot.com — always active with full access</div>
</div>

<!-- SDK-discovered servers (from mcp-config.json / CLI) -->
{#if loading}
  <div class="skeleton-list">
    <div class="skeleton skeleton-row"></div>
    <div class="skeleton skeleton-row"></div>
  </div>
{:else if discoveredMcpServers.length > 0}
  {#each discoveredMcpServers as server (server.name)}
    {@const sessionTools = getMcpTools(server.name)}
    {@const isAuthError = server.error?.includes('HTTP error') || server.error?.includes('401') || server.error?.includes('Streamable HTTP')}
    {@const effectiveStatus = isAuthError && server.status === 'failed' ? 'auth_required' : server.status}
    <div class="mcp-server-item">
      <div class="mcp-server-header">
        <span class="mcp-server-name">{server.name}</span>
        <span class="mcp-server-badge">{server.type || 'mcp'}</span>
        {#if effectiveStatus && effectiveStatus !== 'not_configured'}
          <span class="mcp-server-badge {effectiveStatus === 'connected' ? 'status-ok' : effectiveStatus === 'auth_required' ? 'status-warn' : effectiveStatus === 'failed' ? 'status-err' : ''}">{effectiveStatus === 'auth_required' ? 'needs auth' : effectiveStatus}</span>
        {/if}
      </div>
      <div class="tool-toggle-desc">{server.url || server.command || 'CLI-configured'}</div>
      {#if isAuthError}
        <div class="tool-toggle-desc" style="color: var(--warning, #d29922)">Run <code>copilot</code> CLI and use /mcp to authenticate this server.</div>
      {:else if server.error}
        <div class="tool-toggle-desc" style="color: var(--danger)">{server.error}</div>
      {/if}
      {#if sessionTools.length > 0}
        <div class="mcp-tools-block">
          <div class="mcp-tools-title">Tools exposed to this session</div>
          <div class="mcp-tools-list">
            {#each sessionTools as tool (tool.name)}
              <div class="mcp-tool-chip" title={tool.description || tool.name}>{tool.name}</div>
            {/each}
          </div>
          <p class="settings-hint mcp-test-hint">
            To test this MCP, ask for one of these capabilities explicitly so the model has a clear reason to call it.
          </p>
        </div>
      {:else if effectiveStatus === 'failed'}
        <p class="settings-hint mcp-test-hint">
          This server is configured but failed to start, so it cannot expose tools to the current session yet.
        </p>
      {:else}
        <p class="settings-hint mcp-test-hint">
          No tools from this server are visible in the current session yet. Start a fresh chat session after enabling it, then reopen Settings to confirm its tools appear here.
        </p>
      {/if}
    </div>
  {/each}
{:else}
  <p class="settings-hint">No CLI-configured MCP servers found.</p>
{/if}

<style>
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
    height: 48px;
    width: 100%;
  }
  .tool-toggle-desc {
    font-size: 0.72em;
    color: var(--fg-dim);
    padding-left: 24px;
    margin-top: 1px;
  }
  .mcp-server-item {
    padding: var(--sp-2) 0;
    border-bottom: 1px solid rgba(48, 54, 61, 0.5);
  }
  .mcp-server-item:last-child {
    border-bottom: none;
  }
  .mcp-server-header {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }
  .mcp-server-name {
    font-size: 0.85em;
    font-weight: 600;
    color: var(--purple);
  }
  .mcp-server-badge {
    font-size: 0.65em;
    color: var(--fg-dim);
    background: var(--bg-overlay);
    padding: 1px 6px;
    border-radius: 8px;
    border: 1px solid var(--border);
  }
  .mcp-server-badge.status-ok { color: var(--success, #3fb950); border-color: var(--success, #3fb950); }
  .mcp-server-badge.status-warn { color: var(--warning, #d29922); border-color: var(--warning, #d29922); }
  .mcp-server-badge.status-err { color: var(--danger); border-color: var(--danger); }
  .mcp-tools-block {
    margin-top: var(--sp-2);
    padding-left: 24px;
  }
  .mcp-tools-title {
    font-size: 0.72em;
    color: var(--fg);
    margin-bottom: 6px;
    font-weight: 600;
  }
  .mcp-tools-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .mcp-tool-chip {
    font-size: 0.68em;
    color: var(--fg);
    background: var(--bg-overlay);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 2px 8px;
  }
  .mcp-test-hint {
    padding-left: 0;
    margin-top: 6px;
  }
</style>
