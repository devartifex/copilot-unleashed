<script lang="ts">
  import { Zap, Check, XCircle } from 'lucide-svelte';
  import Spinner from '$lib/components/shared/Spinner.svelte';

  interface FleetAgent {
    agentId: string;
    agentType: string;
    status: 'running' | 'completed' | 'failed';
    error?: string;
  }

  interface Props {
    agents: FleetAgent[];
    active: boolean;
  }

  const { agents, active }: Props = $props();

  const completed = $derived(agents.filter((agent) => agent.status === 'completed').length);
  const failed = $derived(agents.filter((agent) => agent.status === 'failed').length);
  const running = $derived(agents.filter((agent) => agent.status === 'running').length);
</script>

{#if agents.length > 0}
  <div class="fleet-progress" class:fleet-done={!active}>
    <div class="fleet-header">
      <span class="fleet-icon"><Zap size={14} /></span>
      <span class="fleet-title">Fleet Mode</span>
      {#if active}
        <span class="fleet-badge running">{running} running</span>
      {/if}
      {#if completed > 0}
        <span class="fleet-badge completed">{completed} done</span>
      {/if}
      {#if failed > 0}
        <span class="fleet-badge failed">{failed} failed</span>
      {/if}
    </div>
    <div class="fleet-agents">
      {#each agents as agent (agent.agentId)}
        <div
          class="fleet-agent"
          class:agent-running={agent.status === 'running'}
          class:agent-completed={agent.status === 'completed'}
          class:agent-failed={agent.status === 'failed'}
        >
          <span class="agent-status-icon">
            {#if agent.status === 'running'}
              <Spinner color="var(--purple)" />
            {:else if agent.status === 'completed'}
              <Check size={14} />
            {:else}
              <XCircle size={14} />
            {/if}
          </span>
          <span class="agent-name">{agent.agentType || agent.agentId}</span>
          {#if agent.error}
            <span class="agent-error">{agent.error}</span>
          {/if}
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
  .fleet-progress {
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: var(--sp-3);
    margin: var(--sp-2) 0;
    background: var(--bg-raised);
    animation: msg-in 0.3s;
  }

  .fleet-done {
    opacity: 0.7;
  }

  .fleet-header {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin-bottom: var(--sp-2);
    font-size: 0.85em;
    flex-wrap: wrap;
  }

  .fleet-icon {
    color: var(--purple);
    display: inline-flex;
    align-items: center;
  }

  .fleet-title {
    font-weight: 600;
    color: var(--fg);
  }

  .fleet-badge {
    font-size: 0.75em;
    padding: 0.1em 0.5em;
    border-radius: 999px;
    font-weight: 500;
  }

  .fleet-badge.running {
    background: var(--purple);
    color: var(--bg);
  }

  .fleet-badge.completed {
    background: var(--green);
    color: var(--bg);
  }

  .fleet-badge.failed {
    background: var(--red);
    color: var(--bg);
  }

  .fleet-agents {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
  }

  .fleet-agent {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    font-size: 0.82em;
    padding: var(--sp-1) var(--sp-2);
    border-radius: var(--radius-sm);
    background: var(--bg-overlay);
  }

  .agent-status-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .agent-running .agent-status-icon {
    color: var(--purple);
  }

  .agent-completed .agent-status-icon {
    color: var(--green);
  }

  .agent-failed .agent-status-icon {
    color: var(--red);
  }

  .agent-name {
    color: var(--fg-muted);
  }

  .agent-error {
    color: var(--red);
    font-size: 0.9em;
    margin-left: auto;
  }

  @keyframes msg-in {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>
