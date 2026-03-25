<script lang="ts">
  import type {
    ToolInfo,
    QuotaSnapshots,
    InstructionInfo,
    PromptInfo,
    SourcedAgentInfo,
    SourcedMcpServerInfo,
  } from '$lib/types/index.js';
  import { X, ChevronRight } from 'lucide-svelte';
  import InstructionsPanel from './InstructionsPanel.svelte';
  import ToolsPanel from './ToolsPanel.svelte';
  import McpServersPanel from './McpServersPanel.svelte';
  import AgentsPanel from './AgentsPanel.svelte';
  import SkillsPanel from './SkillsPanel.svelte';
  import PromptsPanel from './PromptsPanel.svelte';
  import QuotaPanel from './QuotaPanel.svelte';
  import NotificationsPanel from './NotificationsPanel.svelte';
  import CompactionPanel from './CompactionPanel.svelte';

  interface Props {
    open: boolean;
    tools: ToolInfo[];
    agents: SourcedAgentInfo[];
    currentAgent: string | null;
    quotaSnapshots: QuotaSnapshots | null;
    additionalInstructions: string;
    excludedTools: string[];
    discoveredMcpServers: SourcedMcpServerInfo[];
    availableSkills: Array<{ name: string; description?: string; source?: string; enabled?: boolean; license?: string }>;
    instructions: InstructionInfo[];
    prompts: PromptInfo[];
    onClose: () => void;
    onSaveInstructions: (instructions: string) => void;
    onToggleTool: (toolName: string, enabled: boolean) => void;
    onSelectAgent: (name: string) => void;
    onDeselectAgent: () => void;
    onCompact: () => void;
    onFetchTools: () => void;
    onFetchAgents: () => void;
    onFetchQuota: () => void;
    onFetchSkills: () => void;
    onFetchMcpServers: () => void;
    onFetchInstructions: () => void;
    onFetchPrompts: () => void;
    onToggleSkill: (name: string, enabled: boolean) => void;
    onToggleMcpServer: (name: string, enabled: boolean) => void;
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
    discoveredMcpServers,
    availableSkills,
    instructions,
    prompts,
    onClose,
    onSaveInstructions,
    onToggleTool,
    onSelectAgent,
    onDeselectAgent,
    onCompact,
    onFetchTools,
    onFetchAgents,
    onFetchQuota,
    onFetchSkills,
    onFetchMcpServers,
    onFetchInstructions,
    onFetchPrompts,
    onToggleSkill,
    onToggleMcpServer,
    notificationsEnabled,
    onToggleNotifications,
  }: Props = $props();

  type AccordionSection = 'instructions' | 'tools' | 'mcp' | 'agents' | 'skills' | 'quota' | 'notifications' | 'compact' | 'prompts' | null;

  let activeSection = $state<AccordionSection>(null);

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
    if (section === 'mcp') {
      onFetchMcpServers();
      onFetchTools();
    }
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
</script>

<svelte:window onkeydown={handleEscapeKey} />

{#if open}
  <!-- a11y: overlay is role="presentation" — click-to-dismiss is a mouse convenience; keyboard users press Escape -->
  <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
  <div class="settings-overlay" role="presentation" onclick={handleBackdropClick}>
    <div class="settings-panel" role="presentation">
      <div class="settings-header">
        <span class="settings-title">Settings</span>
        <button class="settings-close" onclick={onClose} aria-label="Close settings"><X size={20} /></button>
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
            <span class="accordion-chevron"><ChevronRight size={16} /></span>
          </button>
          {#if activeSection === 'instructions'}
            <div class="settings-accordion-body">
              <InstructionsPanel {instructions} {additionalInstructions} {onSaveInstructions} />
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
            <span class="accordion-chevron"><ChevronRight size={16} /></span>
          </button>
          {#if activeSection === 'tools'}
            <div class="settings-accordion-body">
              <ToolsPanel {tools} {excludedTools} {onToggleTool} />
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
            <span class="accordion-chevron"><ChevronRight size={16} /></span>
          </button>
          {#if activeSection === 'mcp'}
            <div class="settings-accordion-body">
              <McpServersPanel {discoveredMcpServers} {tools} />
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
            <span class="accordion-chevron"><ChevronRight size={16} /></span>
          </button>
          {#if activeSection === 'agents'}
            <div class="settings-accordion-body">
              <AgentsPanel {agents} {onSelectAgent} {onDeselectAgent} />
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
            <span class="accordion-chevron"><ChevronRight size={16} /></span>
          </button>
          {#if activeSection === 'skills'}
            <div class="settings-accordion-body">
              <SkillsPanel {availableSkills} {onToggleSkill} />
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
            <span class="accordion-chevron"><ChevronRight size={16} /></span>
          </button>
          {#if activeSection === 'prompts'}
            <div class="settings-accordion-body">
              <PromptsPanel {prompts} />
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
            <span class="accordion-chevron"><ChevronRight size={16} /></span>
          </button>
          {#if activeSection === 'quota'}
            <div class="settings-accordion-body">
              <QuotaPanel {quotaSnapshots} />
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
            <span class="accordion-chevron"><ChevronRight size={16} /></span>
          </button>
          {#if activeSection === 'notifications'}
            <div class="settings-accordion-body">
              <NotificationsPanel {notificationsEnabled} {onToggleNotifications} />
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
            <span class="accordion-chevron"><ChevronRight size={16} /></span>
          </button>
          {#if activeSection === 'compact'}
            <div class="settings-accordion-body">
              <CompactionPanel {onCompact} />
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
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: fadeIn 0.15s ease;
  }
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  .settings-panel {
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    width: 100%;
    max-width: 640px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .settings-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--sp-3) var(--sp-4);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .settings-title {
    font-size: 0.9em;
    color: var(--fg);
    font-weight: 600;
  }
  .settings-close {
    background: none;
    border: none;
    color: var(--fg-dim);
    cursor: pointer;
    padding: var(--sp-1);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .settings-body {
    padding: var(--sp-4);
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
    font-size: 0.85em;
    cursor: pointer;
  }
  .settings-accordion-btn:active {
    background: var(--border);
  }
  .accordion-chevron {
    color: var(--fg-dim);
    display: flex;
    align-items: center;
    transition: transform 0.2s ease;
  }
  .settings-accordion-btn.open .accordion-chevron {
    transform: rotate(90deg);
  }
  .settings-accordion-body {
    padding: var(--sp-3);
    border-top: 1px solid var(--border);
    max-height: 60vh;
    overflow-y: auto;
  }

  /* Mobile: fullscreen behavior */
  @media (max-width: 1023px) {
    .settings-overlay {
      align-items: stretch;
      justify-content: stretch;
    }
    .settings-panel {
      max-width: none;
      max-height: none;
      border: none;
      border-radius: 0;
      box-shadow: none;
      flex: 1;
    }
    .settings-header {
      padding-top: calc(var(--sp-3) + var(--safe-top));
    }
    .settings-body {
      padding-bottom: calc(var(--sp-4) + var(--safe-bottom));
    }
    .settings-accordion-body {
      max-height: 250px;
    }
  }
</style>
