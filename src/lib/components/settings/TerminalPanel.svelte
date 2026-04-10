<script lang="ts">
  import Spinner from '$lib/components/shared/Spinner.svelte';
  import { ChevronRight, Trash2, Square } from 'lucide-svelte';

  interface ShellResult {
    command: string;
    stdout: string;
    stderr: string;
    exitCode: number | null;
    pid?: number;
    timestamp: number;
  }

  interface Props {
    onExec: (command: string, cwd?: string) => void;
    onKill: (pid: number) => void;
    results: ShellResult[];
    loading?: boolean;
  }

  const { onExec, onKill, results, loading = false }: Props = $props();

  let command = $state('');
  let cwd = $state('');
  let showCwd = $state(false);
  let outputEl: HTMLDivElement | undefined = $state();

  const activePid = $derived(
    loading && results.length > 0 ? results[results.length - 1].pid : undefined,
  );

  function handleSubmit() {
    const trimmed = command.trim();
    if (!trimmed || loading) return;
    onExec(trimmed, cwd.trim() || undefined);
    command = '';
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function handleClear() {
    // Emit a synthetic clear — parent zeroes the results array
    results.length = 0;
  }

  function formatTime(ts: number): string {
    return new Date(ts).toLocaleTimeString();
  }

  // Auto-scroll to bottom when results change
  $effect(() => {
    void results.length;
    if (outputEl) {
      requestAnimationFrame(() => {
        outputEl!.scrollTop = outputEl!.scrollHeight;
      });
    }
  });
</script>

<div class="terminal-panel">
  <p class="terminal-warning" role="alert">
    ⚠ Commands run on the server. Use with caution.
  </p>

  <!-- Command input -->
  <div class="terminal-input-row">
    <label class="sr-only" for="terminal-cmd">Command</label>
    <input
      id="terminal-cmd"
      class="terminal-input"
      type="text"
      placeholder="Enter command..."
      bind:value={command}
      onkeydown={handleKeydown}
      disabled={loading}
      autocomplete="off"
      spellcheck="false"
    />
    <button
      class="terminal-btn exec-btn"
      onclick={handleSubmit}
      disabled={!command.trim() || loading}
      aria-label="Execute command"
    >
      {#if loading}
        <Spinner />
      {:else}
        Run
      {/if}
    </button>
  </div>

  <!-- Optional CWD toggle -->
  <button
    class="cwd-toggle"
    onclick={() => showCwd = !showCwd}
    type="button"
  >
    <span class="cwd-chevron" class:open={showCwd}><ChevronRight size={12} /></span>
    Working directory
  </button>
  {#if showCwd}
    <div class="cwd-row">
      <label class="sr-only" for="terminal-cwd">Working directory</label>
      <input
        id="terminal-cwd"
        class="terminal-input"
        type="text"
        placeholder="Default (server CWD)"
        bind:value={cwd}
        autocomplete="off"
        spellcheck="false"
      />
    </div>
  {/if}

  <!-- Actions bar -->
  <div class="terminal-actions">
    {#if loading && activePid}
      <button
        class="terminal-btn kill-btn"
        onclick={() => onKill(activePid!)}
        aria-label="Kill running process"
      >
        <Square size={12} /> Kill (PID {activePid})
      </button>
    {/if}
    {#if results.length > 0}
      <button
        class="terminal-btn clear-btn"
        onclick={handleClear}
        aria-label="Clear output history"
      >
        <Trash2 size={12} /> Clear
      </button>
    {/if}
  </div>

  <!-- Output area -->
  <div class="terminal-output" bind:this={outputEl} role="log" aria-live="polite">
    {#if results.length === 0}
      <p class="terminal-empty">No output yet.</p>
    {:else}
      {#each results as result, i (result.timestamp + '-' + i)}
        <div class="result-block">
          <div class="result-header">
            <span class="result-prompt">$</span>
            <span class="result-cmd">{result.command}</span>
            <span class="result-time">{formatTime(result.timestamp)}</span>
          </div>
          {#if result.stdout}
            <pre class="result-stdout">{result.stdout}</pre>
          {/if}
          {#if result.stderr}
            <pre class="result-stderr">{result.stderr}</pre>
          {/if}
          <div class="result-footer">
            {#if result.exitCode !== null}
              <span
                class="result-exit"
                class:success={result.exitCode === 0}
                class:failure={result.exitCode !== 0}
              >
                exit {result.exitCode}
              </span>
            {:else if loading && i === results.length - 1}
              <span class="result-running"><Spinner /> running</span>
            {/if}
          </div>
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .terminal-panel {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .terminal-warning {
    font-family: var(--font-mono);
    font-size: 0.72em;
    color: var(--yellow, #e3b341);
    background: rgba(227, 179, 65, 0.08);
    border: 1px solid rgba(227, 179, 65, 0.25);
    border-radius: var(--radius-sm);
    padding: var(--sp-1) var(--sp-2);
    margin: 0;
    line-height: 1.5;
  }

  .terminal-input-row {
    display: flex;
    gap: var(--sp-1);
  }

  .terminal-input {
    flex: 1;
    background: var(--bg-overlay);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--fg);
    font-family: var(--font-mono);
    font-size: 0.8em;
    padding: var(--sp-1) var(--sp-2);
    outline: none;
  }

  .terminal-input:focus {
    border-color: var(--fg-dim);
  }

  .terminal-input:disabled {
    opacity: 0.5;
  }

  .terminal-btn {
    background: none;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--fg-dim);
    font-family: var(--font-mono);
    font-size: 0.78em;
    padding: var(--sp-1) var(--sp-2);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    white-space: nowrap;
    min-height: 26px;
  }

  .terminal-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .exec-btn {
    min-width: 50px;
    justify-content: center;
  }

  .kill-btn {
    color: var(--red, #f85149);
    border-color: rgba(248, 81, 73, 0.35);
  }

  .cwd-toggle {
    background: none;
    border: none;
    color: var(--fg-dim);
    font-family: var(--font-mono);
    font-size: 0.72em;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    padding: 0;
  }

  .cwd-chevron {
    display: inline-flex;
    transition: transform 0.2s ease;
  }

  .cwd-chevron.open {
    transform: rotate(90deg);
  }

  .cwd-row {
    display: flex;
  }

  .terminal-actions {
    display: flex;
    gap: var(--sp-1);
    min-height: 0;
  }

  .terminal-output {
    background: var(--bg-overlay);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    max-height: 300px;
    overflow-y: auto;
    padding: var(--sp-2);
    font-family: var(--font-mono);
    font-size: 0.75em;
    line-height: 1.6;
  }

  .terminal-empty {
    color: var(--fg-dim);
    margin: 0;
  }

  .result-block {
    margin-bottom: var(--sp-2);
    padding-bottom: var(--sp-2);
    border-bottom: 1px solid var(--border);
  }

  .result-block:last-child {
    margin-bottom: 0;
    padding-bottom: 0;
    border-bottom: none;
  }

  .result-header {
    display: flex;
    align-items: center;
    gap: var(--sp-1);
    margin-bottom: var(--sp-1);
  }

  .result-prompt {
    color: var(--green, #3fb950);
    flex-shrink: 0;
  }

  .result-cmd {
    color: var(--fg);
    flex: 1;
    word-break: break-all;
  }

  .result-time {
    color: var(--fg-dim);
    font-size: 0.85em;
    flex-shrink: 0;
  }

  .result-stdout,
  .result-stderr {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    padding: var(--sp-1) 0;
  }

  .result-stdout {
    color: var(--fg-muted);
  }

  .result-stderr {
    color: var(--red, #f85149);
  }

  .result-footer {
    min-height: 0;
  }

  .result-exit {
    font-size: 0.85em;
  }

  .result-exit.success {
    color: var(--green, #3fb950);
  }

  .result-exit.failure {
    color: var(--red, #f85149);
  }

  .result-running {
    color: var(--yellow, #e3b341);
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    font-size: 0.85em;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    border: 0;
  }
</style>
