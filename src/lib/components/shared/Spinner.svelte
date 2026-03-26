<script lang="ts">
  interface Props {
    color?: string;
    class?: string;
  }

  let { color = 'currentColor', class: className = '' }: Props = $props();
</script>

<span
  class="spinner {className}"
  role="status"
  aria-label="Loading"
  style:color={color}
>
  <!-- Fallback glyph for non-animated or no-CSS environments -->
  ⠋
</span>

<style>
  .spinner {
    display: inline-block;
    font-family: var(--font-mono);
    line-height: 1;
    position: relative;
  }

  .spinner::before {
    content: '⠋';
    display: inline-block;
    animation: spinner-frames 0.8s steps(10, end) infinite;
  }

  @keyframes spinner-frames {
    0% {
      content: '⠋';
    }
    10% {
      content: '⠙';
    }
    20% {
      content: '⠹';
    }
    30% {
      content: '⠸';
    }
    40% {
      content: '⠼';
    }
    50% {
      content: '⠴';
    }
    60% {
      content: '⠦';
    }
    70% {
      content: '⠧';
    }
    80% {
      content: '⠇';
    }
    90% {
      content: '⠏';
    }
  }
</style>
