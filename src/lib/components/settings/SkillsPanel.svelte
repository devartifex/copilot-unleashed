<script lang="ts">
  import type { CustomizationSource } from '$lib/types/index.js';
  import SourceBadge from '$lib/components/shared/SourceBadge.svelte';

  interface Props {
    availableSkills: Array<{ name: string; description?: string; source?: string; enabled?: boolean; license?: string }>;
    onToggleSkill: (name: string, enabled: boolean) => void;
  }

  const { availableSkills, onToggleSkill }: Props = $props();
</script>

<p class="settings-hint">
  Skills are prompt modules discovered by the Copilot CLI. Toggle to enable or disable. The model invokes them automatically when relevant.
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

<style>
  .settings-hint {
    font-family: var(--font-mono);
    font-size: 0.75em;
    color: var(--fg-dim);
    margin-bottom: var(--sp-2);
    line-height: 1.5;
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
</style>
