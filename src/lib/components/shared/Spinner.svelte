<script lang="ts">
  interface Props {
    size?: number;
    color?: string;
    class?: string;
  }

  let { size = 16, color = 'var(--fg-muted)', class: className = '' }: Props = $props();
</script>

<span
  class="spinner {className}"
  role="status"
  aria-label="Loading"
  style:width="{size}px"
  style:height="{size}px"
  style:border-color="{color}"
></span>

<style>
  .spinner {
    display: inline-block;
    border: 2px solid;
    border-right-color: transparent;
    border-radius: 50%;
    animation: spin 0.75s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
