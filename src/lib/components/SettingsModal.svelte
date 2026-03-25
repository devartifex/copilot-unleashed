<script lang="ts">
  import type {
    ToolInfo,
    AgentInfo,
    QuotaSnapshots,
    QuotaSnapshot,
    CustomToolDefinition,
    McpServerDefinition,
    SkillDefinition,
    InstructionInfo,
    PromptInfo,
    SourcedAgentInfo,
    SourcedSkillInfo,
    SourcedMcpServerInfo,
    CustomizationSource,
  } from '$lib/types/index.js';
  import { pickPrimaryQuota } from '$lib/types/index.js';
  import CustomToolsEditor from './CustomToolsEditor.svelte';
  import SourceBadge from './SourceBadge.svelte';

  interface Props {
    open: boolean;
    tools: ToolInfo[];
    agents: SourcedAgentInfo[];
    currentAgent: string | null;
    quotaSnapshots: QuotaSnapshots | null;
    additionalInstructions: string;
    excludedTools: string[];
    customTools: CustomToolDefinition[];
    mcpServers: McpServerDefinition[];
    availableSkills: Array<{ name: string; description?: string; source?: string; enabled?: boolean; license?: string }>;
    instructions: InstructionInfo[];
    prompts: PromptInfo[];
    onClose: () => void;
    onSaveInstructions: (instructions: string) => void;
    onToggleTool: (toolName: string, enabled: boolean) => void;
    onSaveCustomTools: (tools: CustomToolDefinition[]) => void;
    onSaveMcpServers: (servers: McpServerDefinition[]) => void;
    onSelectAgent: (name: string) => void;
    onDeselectAgent: () => void;
    onCompact: () => void;
    onFetchTools: () => void;
    onFetchAgents: () => void;
    onFetchQuota: () => void;
    onFetchSkills: () => void;
    onFetchInstructions: () => void;
    onFetchPrompts: () => void;
    onToggleSkill: (name: string, enabled: boolean) => void;
    onToggleMcpServer: (name: string, enabled: boolean) => void;
    onUsePrompt: (name: string, content: string) => void;
    notificationsEnabled: boolean;
    onToggleNotifications: (enabled: boolean) => void;
  }

  const {
    open,
    tools,
    agents,
    currentAgent,
    quotaSnapshots,
    additionalInstructions,
    excludedTools,
    customTools,
    mcpServers,
    availableSkills,
    instructions,
    prompts,
    onClose,
    onSaveInstructions,
    onToggleTool,
    onSaveCustomTools,
    onSaveMcpServers,
    onSelectAgent,
    onDeselectAgent,
    onCompact,
    onFetchTools,
    onFetchAgents,
    onFetchQuota,
    onFetchSkills,
    onFetchInstructions,
    onFetchPrompts,
    onToggleSkill,
    onToggleMcpServer,
    onUsePrompt,
    notificationsEnabled,
    onToggleNotifications,
  }: Props = $props();

  import {
    isPushSupported,
    isStandalone,
    subscribeToPush,
    unsubscribeFromPush,
    getPushSubscription,
  } from '$lib/utils/push-notifications.js';

  type NotificationStatus = 'unsupported' | 'not-standalone-ios' | 'denied' | 'prompt' | 'subscribed' | 'granted-no-push' | 'loading';

  type AccordionSection = 'instructions' | 'tools' | 'mcp' | 'custom-tools' | 'agents' | 'skills' | 'quota' | 'notifications' | 'compact' | 'prompts' | null;

  let activeSection = $state<AccordionSection>(null);
  let instructionsDraft = $state('');

  // ── MCP server editor state ─────────────────────────────────────────
  const MAX_MCP_SERVERS = 10;
  let mcpShowAddForm = $state(false);
  let mcpExpandedIndex = $state<number | null>(null);
  let mcpDeleteConfirmIndex = $state<number | null>(null);
  let mcpDraftName = $state('');
  let mcpDraftUrl = $state('');
  let mcpDraftType = $state<'http' | 'sse'>('http');
  let mcpDraftHeaders = $state<Array<{ key: string; value: string }>>([]);
  let mcpDraftTools = $state('');
  let mcpDraftTimeout = $state('');
  let mcpDraftEnabled = $state(true);
  let mcpFormError = $state('');

  const canAddMoreMcp = $derived(mcpServers.length < MAX_MCP_SERVERS);

  // ── Notification state ───────────────────────────────────────────────
  let notificationStatus = $state<NotificationStatus>('loading');
  let notificationBusy = $state(false);

  function isIos(): boolean {
    if (typeof navigator === 'undefined') return false;
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  async function refreshNotificationStatus(): Promise<void> {
    if (typeof window === 'undefined') { notificationStatus = 'unsupported'; return; }
    if (!isPushSupported()) {
      // On iOS in-browser (not standalone), push is not available
      if (isIos() && !isStandalone()) {
        notificationStatus = 'not-standalone-ios';
      } else {
        notificationStatus = 'unsupported';
      }
      return;
    }
    if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
      notificationStatus = 'denied';
      if (notificationsEnabled) onToggleNotifications(false);
      return;
    }
    const sub = await getPushSubscription();
    if (sub) {
      notificationStatus = 'subscribed';
      if (!notificationsEnabled) onToggleNotifications(true);
      return;
    }
    // Settings say enabled but browser has no subscription — auto-re-subscribe.
    // First confirm the server has VAPID configured; if not (503), treat push as
    // unsupported and clear the stored preference so we don't keep retrying.
    if (notificationsEnabled && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        const vapidRes = await fetch('/api/push/vapid-key');
        if (!vapidRes.ok) {
          onToggleNotifications(false);
          notificationStatus = 'unsupported';
          return;
        }
      } catch {
        notificationStatus = 'granted-no-push';
        return;
      }
      notificationBusy = true;
      try {
        const newSub = await subscribeToPush();
        notificationStatus = newSub ? 'subscribed' : 'granted-no-push';
      } finally {
        notificationBusy = false;
      }
      return;
    }
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      notificationStatus = 'granted-no-push';
      return;
    }
    notificationStatus = 'prompt';
  }

  async function handleEnableNotifications(): Promise<void> {
    notificationBusy = true;
    try {
      const sub = await subscribeToPush();
      if (sub) {
        notificationStatus = 'subscribed';
        onToggleNotifications(true);
      } else if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
        notificationStatus = 'denied';
        onToggleNotifications(false);
      }
    } finally {
      notificationBusy = false;
    }
  }

  async function handleDisableNotifications(): Promise<void> {
    notificationBusy = true;
    try {
      await unsubscribeFromPush();
      notificationStatus = 'prompt';
      onToggleNotifications(false);
    } finally {
      notificationBusy = false;
    }
  }

  // Refresh notification status when the accordion section opens
  $effect(() => {
    if (activeSection === 'notifications') {
      refreshNotificationStatus();
    }
  });

  function mcpResetDraft(): void {
    mcpDraftName = '';
    mcpDraftUrl = '';
    mcpDraftType = 'http';
    mcpDraftHeaders = [];
    mcpDraftTools = '';
    mcpDraftTimeout = '';
    mcpDraftEnabled = true;
    mcpFormError = '';
  }

  function mcpLoadIntoDraft(server: McpServerDefinition): void {
    mcpDraftName = server.name;
    mcpDraftUrl = server.url;
    mcpDraftType = server.type;
    mcpDraftHeaders = Object.entries(server.headers).map(([key, value]) => ({ key, value }));
    mcpDraftTools = server.tools.length > 0 ? server.tools.join(', ') : '';
    mcpDraftTimeout = server.timeout ? String(server.timeout) : '';
    mcpDraftEnabled = server.enabled;
    mcpFormError = '';
  }

  function mcpValidateUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  function mcpValidateDraft(): string | null {
    if (!mcpDraftName.trim()) return 'Name is required';
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(mcpDraftName.trim())) return 'Name must be alphanumeric/underscore/dash, max 64 chars';
    if (!mcpDraftUrl.trim()) return 'URL is required';
    if (!mcpValidateUrl(mcpDraftUrl)) return 'URL must be https://';
    return null;
  }

  function mcpBuildFromDraft(): McpServerDefinition {
    const headers: Record<string, string> = {};
    for (const h of mcpDraftHeaders) {
      if (h.key.trim()) headers[h.key.trim()] = h.value;
    }
    const tools = mcpDraftTools.trim()
      ? mcpDraftTools.split(',').map(t => t.trim()).filter(Boolean)
      : [];
    const timeoutVal = mcpDraftTimeout.trim() ? Number(mcpDraftTimeout.trim()) : undefined;
    return {
      name: mcpDraftName.trim(),
      url: mcpDraftUrl.trim(),
      type: mcpDraftType,
      headers,
      tools,
      enabled: mcpDraftEnabled,
      ...(timeoutVal && timeoutVal > 0 ? { timeout: timeoutVal } : {}),
    };
  }

  function mcpHandleAdd(): void {
    const err = mcpValidateDraft();
    if (err) { mcpFormError = err; return; }
    const server = mcpBuildFromDraft();
    if (mcpServers.some(s => s.name === server.name)) {
      mcpFormError = 'A server with this name already exists';
      return;
    }
    onSaveMcpServers([...mcpServers, server]);
    mcpResetDraft();
    mcpShowAddForm = false;
  }

  function mcpHandleUpdate(index: number): void {
    const err = mcpValidateDraft();
    if (err) { mcpFormError = err; return; }
    const server = mcpBuildFromDraft();
    const existing = mcpServers.findIndex((s, i) => s.name === server.name && i !== index);
    if (existing >= 0) { mcpFormError = 'A server with this name already exists'; return; }
    const updated = [...mcpServers];
    updated[index] = server;
    onSaveMcpServers(updated);
    mcpExpandedIndex = null;
    mcpResetDraft();
  }

  function mcpHandleDelete(index: number): void {
    const updated = mcpServers.filter((_, i) => i !== index);
    onSaveMcpServers(updated);
    mcpDeleteConfirmIndex = null;
    mcpExpandedIndex = null;
  }

  function mcpToggleEnabled(index: number): void {
    const updated = [...mcpServers];
    updated[index] = { ...updated[index], enabled: !updated[index].enabled };
    onSaveMcpServers(updated);
  }

  // Sync draft when prop changes (including initial value)
  $effect(() => {
    instructionsDraft = additionalInstructions;
  });

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

  const primaryQuota = $derived(pickPrimaryQuota(quotaSnapshots));

  const quotaPercentUsed = $derived(
    primaryQuota?.snapshot?.percentageUsed ?? 0,
  );

  const quotaBarColor = $derived(
    quotaPercentUsed > 90 ? 'red' : quotaPercentUsed > 70 ? 'yellow' : 'green',
  );

  function toggleSection(section: AccordionSection) {
    if (activeSection === section) {
      activeSection = null;
      return;
    }
    activeSection = section;

    if (section === 'tools') onFetchTools();
    if (section === 'agents') onFetchAgents();
    if (section === 'quota') onFetchQuota();
    if (section === 'skills') onFetchSkills();
    if (section === 'instructions') onFetchInstructions();
    if (section === 'prompts') onFetchPrompts();
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  function handleEscapeKey(e: KeyboardEvent) {
    if (open && e.key === 'Escape') onClose();
  }

  function handleSaveInstructions() {
    onSaveInstructions(instructionsDraft);
  }

  function isToolEnabled(toolName: string): boolean {
    return !excludedTools.includes(toolName);
  }

  function handleToolToggle(toolName: string, e: Event) {
    const target = e.target as HTMLInputElement;
    onToggleTool(toolName, target.checked);
  }

  function handleAgentClick(name: string) {
    const agent = agents.find(a => a.name === name);
    if (agent?.isSelected) {
      onDeselectAgent();
    } else {
      onSelectAgent(name);
    }
  }

  function groupBySource<T extends { source: CustomizationSource }>(items: T[]): Map<CustomizationSource, T[]> {
    const groups = new Map<CustomizationSource, T[]>();
    const order: CustomizationSource[] = ['builtin', 'repo', 'user'];
    for (const src of order) {
      const filtered = items.filter(i => i.source === src);
      if (filtered.length > 0) groups.set(src, filtered);
    }
    return groups;
  }

  function formatResetDate(dateStr: string | undefined): string {
    if (!dateStr) return '';
    try {
      return new Date(dateStr).toLocaleDateString();
    } catch {
      return dateStr;
    }
  }
</script>

<svelte:window onkeydown={handleEscapeKey} />

{#if open}
  <!-- a11y: overlay is role="presentation" — click-to-dismiss is a mouse convenience; keyboard users press Escape -->
  <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
  <div class="settings-overlay" role="presentation" onclick={handleBackdropClick}>
    <div class="settings-panel" role="presentation">
      <div class="settings-header">
        <span class="settings-title">Settings</span>
        <button class="settings-close" onclick={onClose}>✕</button>
      </div>

      <div class="settings-body">
        <!-- Additional Instructions -->
        <div class="settings-accordion">
          <button
            class="settings-accordion-btn"
            class:open={activeSection === 'instructions'}
            onclick={() => toggleSection('instructions')}
          >
            Additional Instructions
            <span class="accordion-chevron">▸</span>
          </button>
          {#if activeSection === 'instructions'}
            <div class="settings-accordion-body">
              {#if instructions.length > 0}
                <p class="settings-hint">Instruction files are auto-loaded by the Copilot CLI from <code>~/.copilot/</code> and <code>.github/</code>.</p>
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
            </div>
          {/if}
        </div>

        <!-- Tools -->
        <div class="settings-accordion">
          <button
            class="settings-accordion-btn"
            class:open={activeSection === 'tools'}
            onclick={() => toggleSection('tools')}
          >
            Tools
            <span class="accordion-chevron">▸</span>
          </button>
          {#if activeSection === 'tools'}
            <div class="settings-accordion-body">
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
            </div>
          {/if}
        </div>

        <!-- MCP Servers -->
        <div class="settings-accordion">
          <button
            class="settings-accordion-btn"
            class:open={activeSection === 'mcp'}
            onclick={() => toggleSection('mcp')}
          >
            MCP Servers
            <span class="accordion-chevron">▸</span>
          </button>
          {#if activeSection === 'mcp'}
            <div class="settings-accordion-body">
              <!-- Built-in GitHub server (non-removable) -->
              <div class="mcp-server-item">
                <div class="mcp-server-header">
                  <span class="mcp-server-name">GitHub</span>
                  <span class="mcp-server-badge">built-in</span>
                </div>
                <div class="tool-toggle-desc">api.githubcopilot.com — always active with full access</div>
              </div>

              <!-- User-defined servers -->
              {#each mcpServers as server, i (server.name)}
                <div class="mcp-server-item">
                  <div class="mcp-server-header">
                    <label class="tool-toggle-label" style="flex:1">
                      <input
                        type="checkbox"
                        class="tool-toggle-check"
                        checked={server.enabled}
                        onchange={() => mcpToggleEnabled(i)}
                      />
                      <span class="mcp-server-name">{server.name}</span>
                    </label>
                    <SourceBadge source="user" />
                    <span class="mcp-server-badge">{server.type}</span>
                    <button class="mcp-edit-btn" onclick={() => {
                      if (mcpExpandedIndex === i) {
                        mcpExpandedIndex = null;
                      } else {
                        mcpLoadIntoDraft(server);
                        mcpExpandedIndex = i;
                        mcpShowAddForm = false;
                      }
                    }}>✎</button>
                  </div>
                  <div class="tool-toggle-desc">{server.url}</div>

                  {#if mcpExpandedIndex === i}
                    <div class="mcp-form">
                      {#if mcpFormError}
                        <div class="mcp-form-error">{mcpFormError}</div>
                      {/if}
                      <input class="mcp-input" bind:value={mcpDraftName} placeholder="Name" />
                      <input class="mcp-input" bind:value={mcpDraftUrl} placeholder="https://..." />
                      <select class="mcp-input" bind:value={mcpDraftType}>
                        <option value="http">HTTP (Streamable)</option>
                        <option value="sse">SSE</option>
                      </select>
                      <input class="mcp-input" bind:value={mcpDraftTools} placeholder="Tools filter (comma-separated, empty = all)" />
                      <label class="mcp-headers-label" for="mcp-timeout-edit">Timeout (ms)</label>
                      <input id="mcp-timeout-edit" class="mcp-input" type="number" bind:value={mcpDraftTimeout} placeholder="30000" min="1000" max="300000" />

                      <div class="mcp-headers-label">Headers</div>
                      {#each mcpDraftHeaders as header, hi (hi)}
                        <div class="mcp-header-row">
                          <input class="mcp-input mcp-input-half" bind:value={header.key} placeholder="Key" />
                          <input class="mcp-input mcp-input-half" bind:value={header.value} placeholder="Value" />
                          <button class="mcp-remove-btn" onclick={() => { mcpDraftHeaders = mcpDraftHeaders.filter((_, idx) => idx !== hi); }}>✕</button>
                        </div>
                      {/each}
                      <button class="mcp-link-btn" onclick={() => { mcpDraftHeaders = [...mcpDraftHeaders, { key: '', value: '' }]; }}>+ Add header</button>

                      <div class="mcp-form-actions">
                        <button class="action-btn save" onclick={() => mcpHandleUpdate(i)}>Save</button>
                        {#if mcpDeleteConfirmIndex === i}
                          <button class="action-btn delete" onclick={() => mcpHandleDelete(i)}>Confirm delete</button>
                        {:else}
                          <button class="action-btn delete" onclick={() => { mcpDeleteConfirmIndex = i; }}>Delete</button>
                        {/if}
                        <button class="action-btn" onclick={() => { mcpExpandedIndex = null; mcpResetDraft(); }}>Cancel</button>
                      </div>
                    </div>
                  {/if}
                </div>
              {/each}

              <!-- Add new server form -->
              {#if mcpShowAddForm}
                <div class="mcp-form">
                  {#if mcpFormError}
                    <div class="mcp-form-error">{mcpFormError}</div>
                  {/if}
                  <input class="mcp-input" bind:value={mcpDraftName} placeholder="Name (e.g. my-server)" />
                  <input class="mcp-input" bind:value={mcpDraftUrl} placeholder="https://..." />
                  <select class="mcp-input" bind:value={mcpDraftType}>
                    <option value="http">HTTP (Streamable)</option>
                    <option value="sse">SSE</option>
                  </select>
                  <input class="mcp-input" bind:value={mcpDraftTools} placeholder="Tools filter (comma-separated, empty = all)" />
                  <label class="mcp-headers-label" for="mcp-timeout-add">Timeout (ms)</label>
                  <input id="mcp-timeout-add" class="mcp-input" type="number" bind:value={mcpDraftTimeout} placeholder="30000" min="1000" max="300000" />

                  <div class="mcp-headers-label">Headers</div>
                  {#each mcpDraftHeaders as header, hi (hi)}
                    <div class="mcp-header-row">
                      <input class="mcp-input mcp-input-half" bind:value={header.key} placeholder="Key" />
                      <input class="mcp-input mcp-input-half" bind:value={header.value} placeholder="Value" />
                      <button class="mcp-remove-btn" onclick={() => { mcpDraftHeaders = mcpDraftHeaders.filter((_, idx) => idx !== hi); }}>✕</button>
                    </div>
                  {/each}
                  <button class="mcp-link-btn" onclick={() => { mcpDraftHeaders = [...mcpDraftHeaders, { key: '', value: '' }]; }}>+ Add header</button>

                  <div class="mcp-form-actions">
                    <button class="action-btn save" onclick={mcpHandleAdd}>Add Server</button>
                    <button class="action-btn" onclick={() => { mcpShowAddForm = false; mcpResetDraft(); }}>Cancel</button>
                  </div>
                </div>
              {:else if canAddMoreMcp}
                <button class="mcp-link-btn" style="margin-top: var(--sp-2)" onclick={() => { mcpResetDraft(); mcpShowAddForm = true; mcpExpandedIndex = null; }}>+ Add MCP server</button>
              {/if}
            </div>
          {/if}
        </div>

        <!-- Agents -->
        <div class="settings-accordion">
          <button
            class="settings-accordion-btn"
            class:open={activeSection === 'agents'}
            onclick={() => toggleSection('agents')}
          >
            Agents
            <span class="accordion-chevron">▸</span>
          </button>
          {#if activeSection === 'agents'}
            <div class="settings-accordion-body">
              {#if agents.length === 0}
                <p class="settings-hint">No agents available.</p>
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
            </div>
          {/if}
        </div>

        <!-- Custom Tools -->
        <div class="settings-accordion">
          <button
            class="settings-accordion-btn"
            class:open={activeSection === 'custom-tools'}
            onclick={() => toggleSection('custom-tools')}
          >
            Custom Tools
            <span class="accordion-chevron">▸</span>
          </button>
          {#if activeSection === 'custom-tools'}
            <div class="settings-accordion-body">
              <p class="settings-hint">
                Define webhook-based tools that Copilot can invoke during conversations.
              </p>
              <CustomToolsEditor tools={customTools} onSave={onSaveCustomTools} />
            </div>
          {/if}
        </div>

        <!-- Skills -->
        <div class="settings-accordion">
          <button
            class="settings-accordion-btn"
            class:open={activeSection === 'skills'}
            onclick={() => toggleSection('skills')}
          >
            Skills
            <span class="accordion-chevron">▸</span>
          </button>
          {#if activeSection === 'skills'}
            <div class="settings-accordion-body">
              <p class="settings-hint">
                Skills are reusable prompt modules discovered by the Copilot CLI.
              </p>
              {#if availableSkills.length === 0}
                <p class="settings-hint">No skills available. Start a session first.</p>
              {:else}
                {#each availableSkills as skill (skill.name)}
                  <div class="customization-item">
                    <label class="tool-toggle-label">
                      <input
                        type="checkbox"
                        class="tool-toggle-check"
                        checked={skill.enabled}
                        onchange={() => onToggleSkill(skill.name, !skill.enabled)}
                      />
                      <span class="customization-name">{skill.name}</span>
                    </label>
                    {#if skill.source}
                      <SourceBadge source={skill.source as CustomizationSource} />
                    {/if}
                    {#if skill.description}
                      <p class="customization-desc">{skill.description}</p>
                    {/if}
                  </div>
                {/each}
              {/if}
            </div>
          {/if}
        </div>

        <!-- Prompts -->
        <div class="settings-accordion">
          <button
            class="settings-accordion-btn"
            class:open={activeSection === 'prompts'}
            onclick={() => toggleSection('prompts')}
          >
            Prompts
            <span class="accordion-chevron">▸</span>
          </button>
          {#if activeSection === 'prompts'}
            <div class="settings-accordion-body">
              <p class="settings-hint">
                Reusable prompt templates from <code>.github/prompts/</code> and <code>~/.copilot/prompts/</code>. Click "Use" to fill the chat input, or type <code>/name</code> in chat.
              </p>
              {#if prompts.length === 0}
                <p class="settings-hint">No prompt files found.</p>
              {:else}
                {#each [...groupBySource(prompts).entries()] as [source, items] (source)}
                  <div class="source-group">
                    <div class="source-group-header"><SourceBadge {source} /> <span class="source-group-count">{items.length}</span></div>
                    {#each items as prompt (prompt.name)}
                      <div class="prompt-item">
                        <div class="prompt-header">
                          <span class="customization-name">{prompt.name}</span>
                          <button class="action-btn use-btn" onclick={() => onUsePrompt(prompt.name, prompt.content)}>Use</button>
                        </div>
                        {#if prompt.description}
                          <p class="customization-desc">{prompt.description}</p>
                        {/if}
                      </div>
                    {/each}
                  </div>
                {/each}
              {/if}
            </div>
          {/if}
        </div>

        <!-- Quota -->
        <div class="settings-accordion">
          <button
            class="settings-accordion-btn"
            class:open={activeSection === 'quota'}
            onclick={() => toggleSection('quota')}
          >
            Quota
            <span class="accordion-chevron">▸</span>
          </button>
          {#if activeSection === 'quota'}
            <div class="settings-accordion-body">
              {#if primaryQuota}
                <div class="quota-label">{primaryQuota.label}</div>
                {#if primaryQuota.snapshot.isUnlimitedEntitlement}
                  <div class="quota-text">
                    Unlimited
                    {#if primaryQuota.snapshot.usedRequests != null}
                      · {primaryQuota.snapshot.usedRequests} requests used
                    {/if}
                    {#if primaryQuota.snapshot.resetDate}
                      · Resets {formatResetDate(primaryQuota.snapshot.resetDate)}
                    {/if}
                  </div>
                {:else}
                  <div class="quota-bar-container">
                    <div
                      class="quota-bar {quotaBarColor}"
                      style="width: {Math.min(quotaPercentUsed, 100)}%"
                    ></div>
                  </div>
                  <div class="quota-text">
                    {#if primaryQuota.snapshot.usedRequests != null && primaryQuota.snapshot.entitlementRequests != null}
                      {primaryQuota.snapshot.usedRequests} / {primaryQuota.snapshot.entitlementRequests} requests used
                    {:else}
                      {quotaPercentUsed.toFixed(1)}% used
                    {/if}
                    {#if primaryQuota.snapshot.resetDate}
                      · Resets {formatResetDate(primaryQuota.snapshot.resetDate)}
                    {/if}
                  </div>
                  {#if primaryQuota.snapshot.overage != null && primaryQuota.snapshot.overage > 0}
                    <div class="quota-text" style="color: var(--red); margin-top: var(--sp-1);">
                      ⚠ {primaryQuota.snapshot.overage} overage requests
                    </div>
                  {/if}
                {/if}
              {:else}
                <p class="settings-hint">No quota information available.</p>
              {/if}
            </div>
          {/if}
        </div>

        <!-- Notifications -->
        <div class="settings-accordion">
          <button
            class="settings-accordion-btn"
            class:open={activeSection === 'notifications'}
            onclick={() => toggleSection('notifications')}
          >
            Notifications
            <span class="accordion-chevron">▸</span>
          </button>
          {#if activeSection === 'notifications'}
            <div class="settings-accordion-body">
              {#if notificationStatus === 'loading'}
                <p class="settings-hint">Checking notification status…</p>
              {:else if notificationStatus === 'unsupported'}
                <p class="settings-hint">Push notifications are not supported in this browser.</p>
              {:else if notificationStatus === 'not-standalone-ios'}
                <p class="settings-hint">
                  To enable notifications on iOS, install this app first:
                  tap the <strong>Share</strong> button, then <strong>Add to Home Screen</strong>.
                </p>
              {:else if notificationStatus === 'denied'}
                <p class="settings-hint">
                  Notification permission was blocked. To re-enable, open your browser or device settings and allow notifications for this site.
                </p>
              {:else if notificationStatus === 'subscribed'}
                <p class="settings-hint">Push notifications are enabled. You'll be notified when responses arrive while the app is in the background.</p>
                <button class="action-btn" onclick={handleDisableNotifications} disabled={notificationBusy}>
                  {notificationBusy ? 'Disabling…' : 'Disable Notifications'}
                </button>
              {:else if notificationStatus === 'granted-no-push'}
                <p class="settings-hint">Notifications are allowed but push is not set up. Tap below to enable push notifications.</p>
                <button class="action-btn" onclick={handleEnableNotifications} disabled={notificationBusy}>
                  {notificationBusy ? 'Enabling…' : 'Enable Push Notifications'}
                </button>
              {:else}
                <p class="settings-hint">Get notified when responses arrive while the app is in the background.</p>
                <button class="action-btn" onclick={handleEnableNotifications} disabled={notificationBusy}>
                  {notificationBusy ? 'Enabling…' : 'Enable Notifications'}
                </button>
              {/if}
            </div>
          {/if}
        </div>

        <!-- Compaction -->
        <div class="settings-accordion">
          <button
            class="settings-accordion-btn"
            class:open={activeSection === 'compact'}
            onclick={() => toggleSection('compact')}
          >
            Compaction
            <span class="accordion-chevron">▸</span>
          </button>
          {#if activeSection === 'compact'}
            <div class="settings-accordion-body">
              <p class="settings-hint">
                Compact the conversation to reduce context size while preserving key information.
              </p>
              <button class="action-btn" onclick={onCompact}>Compact Now</button>
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .settings-overlay {
    position: fixed;
    inset: 0;
    background: var(--bg);
    z-index: 100;
    display: flex;
    flex-direction: column;
    animation: fadeIn 0.15s ease;
  }
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  .settings-panel {
    background: var(--bg);
    width: 100%;
    max-width: 600px;
    margin: 0 auto;
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .settings-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--sp-3) var(--sp-4);
    padding-top: calc(var(--sp-3) + var(--safe-top));
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .settings-title {
    font-family: var(--font-mono);
    font-size: 0.9em;
    color: var(--fg);
    font-weight: 600;
  }
  .settings-close {
    background: none;
    border: none;
    color: var(--fg-dim);
    font-size: 1.1em;
    cursor: pointer;
    padding: var(--sp-1);
  }
  .settings-body {
    padding: var(--sp-4);
    padding-bottom: calc(var(--sp-4) + var(--safe-bottom));
    overflow-y: auto;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    min-height: 0;
  }

  /* Accordion */
  .settings-accordion {
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }
  .settings-accordion-btn {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--bg-overlay);
    border: none;
    color: var(--fg);
    padding: var(--sp-3);
    font-family: var(--font-mono);
    font-size: 0.85em;
    cursor: pointer;
  }
  .settings-accordion-btn:active {
    background: var(--border);
  }
  .accordion-chevron {
    color: var(--fg-dim);
    font-size: 0.8em;
    transition: transform 0.2s ease;
  }
  .settings-accordion-btn.open .accordion-chevron {
    transform: rotate(90deg);
  }
  .settings-accordion-body {
    padding: var(--sp-3);
    border-top: 1px solid var(--border);
    max-height: 250px;
    overflow-y: auto;
  }

  /* Tools */
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
  .mcp-edit-btn {
    background: none;
    border: none;
    color: var(--fg-dim);
    cursor: pointer;
    font-size: 0.85em;
    padding: 2px 6px;
  }
  .mcp-form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin-top: var(--sp-2);
    padding: var(--sp-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg);
  }
  .mcp-form-error {
    font-size: 0.75em;
    color: var(--red);
  }
  .mcp-input {
    width: 100%;
    background: var(--bg-overlay);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: var(--sp-1) var(--sp-2);
    font-family: var(--font-mono);
    font-size: 0.8em;
    outline: none;
  }
  .mcp-input:focus {
    border-color: var(--purple);
  }
  .mcp-input-half {
    width: calc(50% - var(--sp-1));
  }
  .mcp-headers-label {
    font-size: 0.72em;
    color: var(--fg-dim);
    margin-top: var(--sp-1);
  }
  .mcp-header-row {
    display: flex;
    gap: var(--sp-1);
    align-items: center;
  }
  .mcp-remove-btn {
    background: none;
    border: none;
    color: var(--fg-dim);
    cursor: pointer;
    font-size: 0.8em;
    padding: 2px;
    flex-shrink: 0;
  }
  .mcp-link-btn {
    background: none;
    border: none;
    color: var(--purple);
    cursor: pointer;
    font-family: var(--font-mono);
    font-size: 0.78em;
    padding: var(--sp-1) 0;
    text-align: left;
  }
  .mcp-form-actions {
    display: flex;
    gap: var(--sp-2);
    margin-top: var(--sp-1);
  }
  .action-btn.delete {
    color: var(--red);
    border-color: var(--red);
  }

  /* Agents */
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

  /* Quota */
  .quota-label {
    font-size: 0.82em;
    color: var(--fg-muted);
    margin-bottom: var(--sp-1);
  }
  .quota-bar-container {
    width: 100%;
    height: 8px;
    background: var(--bg);
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: var(--sp-1);
    border: 1px solid var(--border);
  }
  .quota-bar {
    height: 100%;
    border-radius: 4px;
    transition: width 0.5s ease;
  }
  .quota-bar.green {
    background: var(--green);
  }
  .quota-bar.yellow {
    background: var(--yellow);
  }
  .quota-bar.red {
    background: var(--red);
  }
  .quota-text {
    font-size: 0.75em;
    color: var(--fg-dim);
  }

  .settings-hint {
    font-family: var(--font-mono);
    font-size: 0.75em;
    color: var(--fg-dim);
    margin-bottom: var(--sp-2);
    line-height: 1.5;
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

  /* ── Skills ─────────────────────────────────────────────────────────────── */
  .skill-item {
    padding: var(--sp-2) var(--sp-1);
    border-bottom: 1px solid var(--border);
  }
  .skill-item:last-child {
    border-bottom: none;
  }
  .skill-name {
    font-size: 0.85em;
    font-weight: 500;
    color: var(--fg);
  }
  .skill-desc {
    font-size: 0.75em;
    color: var(--fg-dim);
    margin: var(--sp-1) 0 0 calc(16px + var(--sp-2));
    line-height: 1.4;
  }
  .skill-meta {
    display: inline-block;
    font-size: 0.7em;
    color: var(--fg-dim);
    margin-left: calc(16px + var(--sp-2));
    margin-top: var(--sp-1);
    padding: 1px 6px;
    background: var(--bg-overlay);
    border-radius: var(--radius-sm);
  }

  /* ── Source groups ──────────────────────────────────────────────────────── */
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

  /* ── Customization items (instructions, skills, prompts) ──────────────── */
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
  .customization-meta {
    display: inline-block;
    font-size: 0.7em;
    color: var(--fg-dim);
    margin-left: var(--sp-2);
    padding: 1px 6px;
    background: var(--bg-overlay);
    border-radius: var(--radius-sm);
  }

  /* ── Instructions divider ─────────────────────────────────────────────── */
  .instructions-divider {
    border-top: 1px solid var(--border);
    margin: var(--sp-3) 0;
  }

  /* ── Prompt items ─────────────────────────────────────────────────────── */
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
