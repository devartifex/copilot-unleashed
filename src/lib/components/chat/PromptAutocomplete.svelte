<script lang="ts">
  import { tick } from 'svelte';

  interface Props {
    inputValue: string;
    textareaEl: HTMLTextAreaElement | undefined;
    prompts: Array<{ name: string; description: string; content: string }>;
    showSlashHint: boolean;
    onAutoResize: () => void;
  }

  let { inputValue = $bindable(), textareaEl, prompts, showSlashHint, onAutoResize }: Props = $props();

  let promptOpen = $state(false);
  let promptQuery = $state('');
  let promptStartPos = $state(0);
  let promptFiltered = $state<Array<{ name: string; description: string; content: string }>>([]);
  let promptIndex = $state(0);
  let promptListEl: HTMLUListElement | undefined = $state();

  function closePromptSlash() {
    promptOpen = false;
    promptFiltered = [];
    promptQuery = '';
    promptIndex = 0;
  }

  function selectSlashPrompt(prompt: { name: string; content: string }) {
    const content = prompt.content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim();
    const before = inputValue.slice(0, promptStartPos);
    inputValue = before + content;
    closePromptSlash();
    tick().then(() => {
      if (textareaEl) {
        textareaEl.selectionStart = inputValue.length;
        textareaEl.selectionEnd = inputValue.length;
        textareaEl.focus();
        onAutoResize();
      }
    });
  }

  function scrollPromptIntoView() {
    tick().then(() => {
      if (!promptListEl) return;
      const active = promptListEl.querySelector('[aria-selected="true"]');
      active?.scrollIntoView({ block: 'nearest' });
    });
  }

  export function detect() {
    if (!textareaEl || prompts.length === 0) return;
    const pos = textareaEl.selectionStart;
    const text = inputValue.slice(0, pos);

    const lastSlash = text.lastIndexOf('/');
    if (lastSlash === -1) {
      closePromptSlash();
      return;
    }

    // / must be at start of text or preceded by whitespace
    if (lastSlash > 0 && !/\s/.test(text[lastSlash - 1])) {
      closePromptSlash();
      return;
    }

    const query = text.slice(lastSlash + 1);
    // If there's a space in the query, the slash command is complete
    if (/\s/.test(query)) {
      closePromptSlash();
      return;
    }

    // Don't show prompt autocomplete when built-in slash commands are active
    if (showSlashHint) {
      closePromptSlash();
      return;
    }

    promptStartPos = lastSlash;
    promptQuery = query.toLowerCase();
    promptOpen = true;

    promptFiltered = prompts.filter(p =>
      p.name.toLowerCase().includes(promptQuery) ||
      p.description.toLowerCase().includes(promptQuery)
    );
    promptIndex = 0;
  }

  export function handleKeydown(event: KeyboardEvent): boolean {
    if (!promptOpen) return false;

    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        closePromptSlash();
        return true;
      case 'ArrowDown':
        if (promptFiltered.length === 0) return false;
        event.preventDefault();
        promptIndex = (promptIndex + 1) % promptFiltered.length;
        scrollPromptIntoView();
        return true;
      case 'ArrowUp':
        if (promptFiltered.length === 0) return false;
        event.preventDefault();
        promptIndex = (promptIndex - 1 + promptFiltered.length) % promptFiltered.length;
        scrollPromptIntoView();
        return true;
      case 'Enter':
      case 'Tab':
        if (promptFiltered.length === 0) return false;
        event.preventDefault();
        selectSlashPrompt(promptFiltered[promptIndex]);
        return true;
      default:
        return false;
    }
  }
</script>

{#if promptOpen && promptFiltered.length > 0}
  <div class="mention-popover" role="listbox" aria-label="Prompt suggestions">
    <ul class="mention-list" bind:this={promptListEl}>
      {#each promptFiltered.slice(0, 8) as prompt, i (prompt.name)}
        <li
          class="mention-item"
          class:active={i === promptIndex}
          role="option"
          aria-selected={i === promptIndex}
          onmousedown={(e) => { e.preventDefault(); selectSlashPrompt(prompt); }}
          onmouseenter={() => { promptIndex = i; }}
        >
          <span class="prompt-cmd" aria-hidden="true">/{prompt.name}</span>
          <span class="mention-path">{prompt.description}</span>
        </li>
      {/each}
    </ul>
    {#if promptFiltered.length > 8}
      <div class="mention-more">{promptFiltered.length - 8} more…</div>
    {/if}
  </div>
{/if}

<style>
  .mention-popover {
    position: absolute;
    bottom: 100%;
    left: var(--sp-2);
    right: var(--sp-2);
    background: var(--bg-raised, var(--bg-overlay));
    border: 1px solid var(--border);
    border-radius: var(--radius);
    margin-bottom: var(--sp-1);
    z-index: 12;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
    animation: popoverIn 0.12s ease;
    overflow: hidden;
  }

  @keyframes popoverIn {
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .mention-list {
    list-style: none;
    margin: 0;
    padding: var(--sp-1) 0;
    max-height: 280px;
    overflow-y: auto;
    scrollbar-width: thin;
  }

  .mention-item {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    padding: var(--sp-1) var(--sp-3);
    cursor: pointer;
    font-family: var(--font-mono);
    font-size: 0.82em;
    color: var(--fg);
    transition: background 0.08s ease;
    min-height: 32px;
  }

  .mention-item:hover,
  .mention-item.active {
    background: var(--bg-secondary, rgba(255, 255, 255, 0.08));
  }

  .prompt-cmd {
    flex-shrink: 0;
    font-family: var(--font-mono);
    font-weight: 600;
    color: var(--purple);
    font-size: 0.85em;
  }

  .mention-path {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .mention-more {
    padding: var(--sp-1) var(--sp-3);
    color: var(--fg-dim);
    font-family: var(--font-mono);
    font-size: 0.75em;
    border-top: 1px solid var(--border);
    text-align: center;
  }
</style>
