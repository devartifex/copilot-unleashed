<script lang="ts">
  import { createAuthStore } from '$lib/stores/auth.svelte';

  const auth = createAuthStore();

  let copyText = $state('copy');
  let copyHighlight = $state(false);
  let copyTimeout: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    auth.startDeviceFlow();
    return () => {
      auth.destroy();
      if (copyTimeout) clearTimeout(copyTimeout);
    };
  });

  function copyCode(): void {
    if (!auth.deviceCode) return;
    navigator.clipboard.writeText(auth.deviceCode.user_code).then(() => {
      copyText = 'copied!';
      copyHighlight = true;
      if (copyTimeout) clearTimeout(copyTimeout);
      copyTimeout = setTimeout(() => {
        copyText = 'copy';
        copyHighlight = false;
      }, 2000);
    });
  }
</script>

<div class="login-screen">
  <div class="login-card">
    <div class="login-logo">
      <img class="copilot-icon" src="/img/logo.png" alt="Copilot CLI Mobile" />
    </div>
    <h1 class="login-title">Copilot CLI Mobile</h1>
    <p class="login-subtitle">Sign in to get started</p>

    {#if auth.deviceCode}
      <div class="login-instruction">
        <span class="c-yellow">●</span> Enter this code at
        <span class="c-bold">github.com/login/device</span>
      </div>
      <div class="device-code-box">
        <span class="device-code-text">{auth.deviceCode.user_code}</span>
        <button
          class="copy-code-btn"
          class:copy-success={copyHighlight}
          onclick={copyCode}
          title="Copy code"
        >
          {copyText}
        </button>
      </div>
      <a
        href={auth.deviceCode.verification_uri}
        target="_blank"
        rel="noopener noreferrer"
        class="device-link-btn"
      >
        Open github.com/login/device ↗
      </a>
    {:else}
      <div class="device-code-box">
        <span class="device-code-text placeholder">- - - - - - - -</span>
      </div>
    {/if}

    <div class="login-status">
      {#if auth.authStatus === 'polling'}
        <span class="spinner-char">{auth.spinnerChar}</span>
        <span>{auth.errorMessage || 'Waiting for authorization…'}</span>
      {:else if auth.authStatus === 'authorized'}
        <span class="spinner-char done">✓</span>
        <span>Authorized as @{auth.user?.login}</span>
      {:else if auth.authStatus === 'expired'}
        <span class="spinner-char failed">✗</span>
        <span>Code expired — refresh the page to try again.</span>
      {:else if auth.authStatus === 'denied'}
        <span class="spinner-char failed">✗</span>
        <span>Access denied — authorization was cancelled on GitHub.</span>
      {:else if auth.authStatus === 'error'}
        <span class="spinner-char failed">✗</span>
        <span>{auth.errorMessage || 'Failed to start device flow.'}</span>
      {:else}
        <span class="spinner-char">{auth.spinnerChar}</span>
        <span>Initializing…</span>
      {/if}
    </div>

    {#if auth.authStatus === 'polling' && auth.countdown > 0}
      <div class="login-expires">
        Code expires in {auth.countdownFormatted}
      </div>
    {/if}
  </div>
</div>

<style>
  .login-screen {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--sp-4);
    height: 100dvh;
    height: var(--vh, 100dvh);
  }

  .login-card {
    max-width: 420px;
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-3);
  }

  .login-logo {
    margin-bottom: var(--sp-2);
  }

  .copilot-icon {
    width: 64px;
    height: 64px;
    filter: drop-shadow(0 0 18px rgba(210, 168, 255, 0.25));
  }

  .login-title {
    font-family: var(--font-mono);
    font-size: 1.5em;
    font-weight: 700;
    color: var(--fg);
    letter-spacing: -0.02em;
    text-align: center;
  }

  .login-subtitle {
    color: var(--fg-muted);
    font-size: 0.9em;
    text-align: center;
    margin-bottom: var(--sp-2);
  }

  .login-instruction {
    color: var(--fg-muted);
    font-size: 0.85em;
    text-align: center;
    line-height: var(--line-height);
  }

  .login-status {
    color: var(--fg-muted);
    font-size: 0.85em;
    text-align: center;
  }

  .login-expires {
    color: var(--fg-dim);
    font-size: 0.8em;
    text-align: center;
  }

  .device-code-box {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    margin: var(--sp-1) 0;
    padding: var(--sp-3) var(--sp-4);
    background: var(--bg-raised);
    border: 1px solid var(--border-accent);
    border-radius: var(--radius-md);
    animation: code-glow 3s ease-in-out infinite;
    width: 100%;
  }

  @keyframes code-glow {
    0%,
    100% {
      box-shadow: 0 0 0 0 rgba(210, 168, 255, 0);
    }
    50% {
      box-shadow: 0 0 24px -4px rgba(210, 168, 255, 0.15);
    }
  }

  .device-code-text {
    font-size: 1.6em;
    font-weight: 700;
    letter-spacing: 0.15em;
    color: var(--purple);
    user-select: all;
    flex: 1;
  }

  .device-code-text.placeholder {
    color: var(--fg-dim);
  }

  .copy-code-btn {
    background: var(--bg-overlay);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--fg-muted);
    cursor: pointer;
    padding: var(--sp-2) var(--sp-3);
    font-family: var(--font-mono);
    font-size: 0.8em;
    transition: all 0.2s ease;
    min-height: 36px;
    min-width: 60px;
    touch-action: manipulation;
  }

  .copy-code-btn:active {
    background: var(--border);
    transform: scale(0.96);
  }

  .copy-code-btn.copy-success {
    color: var(--green);
  }

  .device-link-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--sp-2);
    padding: var(--sp-3) var(--sp-4);
    background: var(--purple-dim);
    color: var(--fg);
    text-decoration: none;
    border-radius: var(--radius-md);
    font-family: var(--font-mono);
    font-size: 0.85em;
    font-weight: 600;
    transition: all 0.2s ease;
    min-height: 44px;
    width: 100%;
    touch-action: manipulation;
  }

  .device-link-btn:active {
    opacity: 0.8;
    transform: scale(0.98);
  }

  .spinner-char {
    display: inline-block;
    color: var(--yellow);
  }

  .spinner-char.done {
    color: var(--green);
  }

  .spinner-char.failed {
    color: var(--red);
  }

  .c-yellow {
    color: var(--yellow);
  }

  .c-bold {
    font-weight: 700;
    color: var(--fg);
  }
</style>
