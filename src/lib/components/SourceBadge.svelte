<script lang="ts">
  import type { CustomizationSource } from '$lib/types/index.js';

  interface Props {
    source: CustomizationSource;
  }

  const { source }: Props = $props();

  const labels: Record<CustomizationSource, string> = {
    builtin: 'Built-in',
    user: 'User',
    repo: 'Repo',
  };
</script>

<span class="source-badge {source}">{labels[source]}</span>

<style>
  .source-badge {
    display: inline-block;
    font-size: 0.65em;
    padding: 1px 6px;
    border-radius: 8px;
    border: 1px solid var(--border);
    white-space: nowrap;
    line-height: 1.4;
  }
  .source-badge.builtin {
    color: var(--blue, #58a6ff);
    background: rgba(88, 166, 255, 0.08);
    border-color: rgba(88, 166, 255, 0.3);
  }
  .source-badge.user {
    color: var(--green);
    background: rgba(63, 185, 80, 0.08);
    border-color: rgba(63, 185, 80, 0.3);
  }
  .source-badge.repo {
    color: var(--purple);
    background: rgba(210, 168, 255, 0.08);
    border-color: rgba(210, 168, 255, 0.3);
  }
</style>
