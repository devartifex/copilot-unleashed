<script lang="ts">
  import { tick } from 'svelte';
  import type { SessionMode } from '$lib/types/index.js';

  interface Props {
    inputValue: string;
    textareaEl: HTMLTextAreaElement | undefined;
    showSlashHint: boolean;
    onSetMode: (mode: SessionMode) => void;
    onFleet?: (prompt: string) => void;
    onNewChat?: () => void;
    onOpenModelSheet?: () => void;
    onCompact?: () => void;
    onDetectMention: () => void;
    onDetectIssue: () => void;
    onShowHelp: () => void;
    onOpenSessions?: () => void;
    onOpenSettings?: () => void;
  }

  let {
    inputValue = $bindable(),
    textareaEl,
    showSlashHint,
    onSetMode,
    onFleet,
    onNewChat,
    onOpenModelSheet,
    onCompact,
    onDetectMention,
    onDetectIssue,
    onShowHelp,
    onOpenSessions,
    onOpenSettings,
  }: Props = $props();

  interface SlashCommand {
    cmd: string;
    desc: string;
    action: () => void;
  }

  const slashCommands = $derived.by((): SlashCommand[] => {
    const cmds: SlashCommand[] = [
      { cmd: '/ask', desc: 'Switch to Ask mode', action: () => { onSetMode('interactive'); inputValue = ''; textareaEl?.focus(); } },
      { cmd: '/plan', desc: 'Switch to Plan mode', action: () => { onSetMode('plan'); inputValue = ''; textareaEl?.focus(); } },
      { cmd: '/agent', desc: 'Switch to Agent mode', action: () => { onSetMode('autopilot'); inputValue = ''; textareaEl?.focus(); } },
    ];
    if (onFleet) {
      cmds.push({ cmd: '/fleet', desc: 'Run parallel sub-agents on a task', action: () => { onSetMode('autopilot'); inputValue = '/fleet '; textareaEl?.focus(); } });
    }
    if (onNewChat) {
      cmds.push({ cmd: '/clear', desc: 'Start a new conversation', action: () => { onNewChat(); inputValue = ''; textareaEl?.focus(); } });
    }
    if (onOpenModelSheet) {
      cmds.push({ cmd: '/model', desc: 'Switch model', action: () => { onOpenModelSheet(); inputValue = ''; } });
      cmds.push({ cmd: '/reasoning', desc: 'Set reasoning effort', action: () => { onOpenModelSheet(); inputValue = ''; } });
    }
    if (onCompact) {
      cmds.push({ cmd: '/compact', desc: 'Compact conversation context', action: () => { onCompact(); inputValue = ''; textareaEl?.focus(); } });
    }
    // Commands that show results in the chat (handled by handleSend)
    cmds.push({ cmd: '/skills', desc: 'List skills', action: () => { /* sent through chat */ } });
    cmds.push({ cmd: '/extensions', desc: 'List extensions', action: () => { /* sent through chat */ } });
    cmds.push({ cmd: '/mcp', desc: 'List MCP servers', action: () => { /* sent through chat */ } });
    cmds.push({ cmd: '/tools', desc: 'List available tools', action: () => { /* sent through chat */ } });
    cmds.push({ cmd: '/quota', desc: 'Show usage & quota', action: () => { /* sent through chat */ } });
    cmds.push({ cmd: '/status', desc: 'Show session status', action: () => { /* sent through chat */ } });
    cmds.push({ cmd: '/run', desc: 'Run a shell command', action: () => { inputValue = '/run '; textareaEl?.focus(); } });
    cmds.push({ cmd: '/help', desc: 'Show keyboard shortcuts', action: () => { inputValue = ''; onShowHelp(); } });
    if (onOpenSessions) {
      cmds.push({ cmd: '/sessions', desc: 'Browse & resume sessions', action: () => { onOpenSessions(); inputValue = ''; } });
    }
    if (onOpenSettings) {
      cmds.push({ cmd: '/settings', desc: 'Open settings', action: () => { onOpenSettings(); inputValue = ''; } });
    }
    cmds.push(
      { cmd: '@', desc: 'Mention a file', action: () => { inputValue = '@'; textareaEl?.focus(); tick().then(() => onDetectMention()); } },
      { cmd: '#', desc: 'Reference an issue or PR', action: () => { inputValue = '#'; textareaEl?.focus(); tick().then(() => onDetectIssue()); } },
      { cmd: '?', desc: 'Show keyboard shortcuts', action: () => { inputValue = ''; onShowHelp(); } },
    );
    return cmds;
  });

  const filteredSlashCommands = $derived.by(() => {
    if (!showSlashHint) return [];
    const typed = inputValue.toLowerCase();
    return slashCommands.filter(c => c.cmd.startsWith(typed) || typed === '/');
  });

  let slashIndex = $state(0);

  $effect(() => {
    if (showSlashHint) {
      if (slashIndex >= filteredSlashCommands.length) {
        slashIndex = 0;
      }
    } else {
      slashIndex = 0;
    }
  });

  export function handleKeydown(event: KeyboardEvent): boolean {
    if (!showSlashHint || filteredSlashCommands.length === 0) return false;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      slashIndex = (slashIndex + 1) % filteredSlashCommands.length;
      return true;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      slashIndex = (slashIndex - 1 + filteredSlashCommands.length) % filteredSlashCommands.length;
      return true;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      filteredSlashCommands[slashIndex].action();
      return true;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      inputValue = '';
      return true;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      filteredSlashCommands[slashIndex].action();
      return true;
    }
    return false;
  }
</script>

{#if showSlashHint && filteredSlashCommands.length > 0}
  <div class="slash-hint" role="listbox" aria-label="Slash commands">
    {#each filteredSlashCommands as cmd, i (cmd.cmd)}
      <button
        class="slash-option"
        class:active={i === slashIndex}
        role="option"
        aria-selected={i === slashIndex}
        onclick={() => cmd.action()}
        onmouseenter={() => { slashIndex = i; }}
      >
        <span class="slash-cmd">{cmd.cmd}</span>
        <span class="slash-desc">{cmd.desc}</span>
      </button>
    {/each}
  </div>
{/if}

<style>
  .slash-hint {
    position: absolute;
    bottom: 100%;
    left: var(--sp-2);
    right: var(--sp-2);
    background: var(--bg-overlay);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: var(--sp-1);
    margin-bottom: var(--sp-1);
    z-index: 10;
    animation: slashIn 0.15s ease;
  }

  @keyframes slashIn {
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .slash-option {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    width: 100%;
    padding: var(--sp-2) var(--sp-3);
    border: none;
    border-radius: var(--radius);
    background: transparent;
    color: var(--fg);
    cursor: pointer;
    text-align: left;
    font-size: 0.85em;
  }

  .slash-option:hover,
  .slash-option.active {
    background: var(--bg-secondary);
  }

  .slash-cmd {
    font-family: var(--font-mono);
    font-weight: 600;
    color: var(--purple);
  }

  .slash-desc {
    color: var(--fg-muted);
  }
</style>
