<script lang="ts">
  interface Props {
    username?: string;
  }

  const { username }: Props = $props();
</script>

<div class="banner-box">
  <div class="banner-inner">
    <img src="/img/logo-no-bg.svg" alt="" class="banner-logo" aria-hidden="true" />
    <h2 class="banner-greeting">
      {#if username}
        Hello, {username}
      {:else}
        How can I help?
      {/if}
    </h2>
    <p class="banner-sub">Describe a task to get started.</p>
    <div class="banner-hints">
      <span class="hint">Switch modes or models from the top bar</span>
      <span class="hint-sep">·</span>
      <span class="hint">AI may make mistakes — always verify</span>
    </div>
  </div>
</div>

<style>
  .banner-box {
    display: flex;
    justify-content: center;
    padding: var(--sp-6) 0 var(--sp-4);
  }

  .banner-inner {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-2);
    max-width: 320px;
    text-align: center;
  }

  .banner-logo {
    width: 48px;
    height: 48px;
    opacity: 0.8;
    margin-bottom: var(--sp-1);
    filter: drop-shadow(0 0 16px rgba(210, 168, 255, 0.25));
  }

  .banner-greeting {
    font-family: var(--font-mono);
    font-size: 1.2em;
    font-weight: 600;
    color: var(--fg);
    margin: 0;
  }

  .banner-sub {
    color: var(--fg-muted);
    font-size: 0.88em;
    margin: 0;
  }

  .banner-hints {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--sp-1);
    margin-top: var(--sp-1);
  }

  .hint {
    color: var(--fg-dim);
    font-size: 0.75em;
  }

  .hint-sep {
    color: var(--fg-dim);
    font-size: 0.75em;
    opacity: 0.4;
  }
</style>
