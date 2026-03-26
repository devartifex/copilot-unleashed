<script lang="ts">
  const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

  interface Props {
    color?: string;
    class?: string;
  }

  let { color = 'currentColor', class: className = '' }: Props = $props();
  let frame = $state(0);

  $effect(() => {
    const id = setInterval(() => {
      frame = (frame + 1) % FRAMES.length;
    }, 80);
    return () => clearInterval(id);
  });
</script>

<span class="spinner {className}" aria-hidden="true" style:color={color}>{FRAMES[frame]}</span>

<style>
  .spinner {
    display: inline-block;
    font-family: var(--font-mono);
    line-height: 1;
  }
</style>
