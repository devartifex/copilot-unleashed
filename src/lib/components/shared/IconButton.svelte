<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    onclick?: (e: MouseEvent) => void;
    title?: string;
    'aria-label'?: string;
    size?: 'sm' | 'md' | 'lg';
    variant?: 'ghost' | 'default' | 'danger';
    disabled?: boolean;
    class?: string;
    children: Snippet;
  }

  let {
    onclick,
    title,
    'aria-label': ariaLabel,
    size = 'md',
    variant = 'ghost',
    disabled = false,
    class: className = '',
    children,
  }: Props = $props();
</script>

<button
  type="button"
  class="icon-btn {size} {variant} {className}"
  {onclick}
  {title}
  aria-label={ariaLabel ?? title}
  {disabled}
>
  {@render children()}
</button>

<style>
  .icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--fg-muted);
    cursor: pointer;
    transition: background var(--duration-fast) var(--ease-default),
                color var(--duration-fast) var(--ease-default);
    flex-shrink: 0;
  }
  .icon-btn:hover:not(:disabled) { background: var(--bg-overlay); color: var(--fg); }
  .icon-btn:active:not(:disabled) { background: var(--border); }
  .icon-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .sm { width: 28px; height: 28px; }
  .md { width: 36px; height: 36px; }
  .lg { width: 44px; height: 44px; }

  .danger:hover:not(:disabled) { color: var(--red); }
</style>
