<script lang="ts">
  import { tick } from 'svelte';

  interface Props {
    inputValue: string;
    textareaEl: HTMLTextAreaElement | undefined;
    onAutoResize: () => void;
  }

  let { inputValue = $bindable(), textareaEl, onAutoResize }: Props = $props();

  let mentionOpen = $state(false);
  let mentionQuery = $state('');
  let mentionStartPos = $state(0);
  let mentionFiles = $state<string[]>([]);
  let mentionIndex = $state(0);
  let mentionLoading = $state(false);
  let mentionError = $state('');
  let mentionListEl: HTMLUListElement | undefined = $state();
  let mentionFetchTimer: ReturnType<typeof setTimeout> | undefined;

  async function fetchMentionFiles(query: string) {
    mentionLoading = true;
    mentionError = '';
    try {
      const params = query ? `?q=${encodeURIComponent(query)}` : '';
      const res = await fetch(`/api/files${params}`);
      if (!res.ok) {
        mentionFiles = [];
        mentionError = res.status === 401 ? 'Not authenticated' : 'Failed to load files';
        return;
      }
      const data = await res.json();
      mentionFiles = Array.isArray(data.files) ? data.files : [];
      mentionError = data.error ?? '';
      mentionIndex = 0;
    } catch {
      mentionFiles = [];
      mentionError = 'Failed to load files';
    } finally {
      mentionLoading = false;
    }
  }

  function closeMention() {
    mentionOpen = false;
    mentionFiles = [];
    mentionQuery = '';
    mentionIndex = 0;
    mentionError = '';
    if (mentionFetchTimer) {
      clearTimeout(mentionFetchTimer);
      mentionFetchTimer = undefined;
    }
  }

  function selectMentionFile(filePath: string) {
    if (!textareaEl) return;
    const before = inputValue.slice(0, mentionStartPos);
    const after = inputValue.slice(textareaEl.selectionStart);
    inputValue = `${before}@${filePath}${after ? '' : ' '}${after}`;
    closeMention();
    tick().then(() => {
      if (textareaEl) {
        const newPos = before.length + 1 + filePath.length + (after ? 0 : 1);
        textareaEl.selectionStart = newPos;
        textareaEl.selectionEnd = newPos;
        textareaEl.focus();
        onAutoResize();
      }
    });
  }

  function scrollMentionIntoView() {
    tick().then(() => {
      if (!mentionListEl) return;
      const active = mentionListEl.querySelector('[aria-selected="true"]');
      active?.scrollIntoView({ block: 'nearest' });
    });
  }

  export function detect() {
    if (!textareaEl) return;
    const pos = textareaEl.selectionStart;
    const text = inputValue.slice(0, pos);

    const lastAt = text.lastIndexOf('@');
    if (lastAt === -1) {
      closeMention();
      return;
    }

    // @ must be at start of text or preceded by whitespace
    if (lastAt > 0 && !/\s/.test(text[lastAt - 1])) {
      closeMention();
      return;
    }

    const query = text.slice(lastAt + 1);
    // If there's a space in the query, the mention is complete
    if (/\s/.test(query)) {
      closeMention();
      return;
    }

    mentionStartPos = lastAt;
    mentionQuery = query;
    mentionOpen = true;
    mentionLoading = true;

    if (mentionFetchTimer) clearTimeout(mentionFetchTimer);
    mentionFetchTimer = setTimeout(() => fetchMentionFiles(query), 150);
  }

  export function handleKeydown(event: KeyboardEvent): boolean {
    if (!mentionOpen) return false;

    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        closeMention();
        return true;
      case 'ArrowDown':
        if (mentionFiles.length === 0) return false;
        event.preventDefault();
        mentionIndex = (mentionIndex + 1) % mentionFiles.length;
        scrollMentionIntoView();
        return true;
      case 'ArrowUp':
        if (mentionFiles.length === 0) return false;
        event.preventDefault();
        mentionIndex = (mentionIndex - 1 + mentionFiles.length) % mentionFiles.length;
        scrollMentionIntoView();
        return true;
      case 'Enter':
      case 'Tab':
        if (mentionFiles.length === 0) return false;
        event.preventDefault();
        selectMentionFile(mentionFiles[mentionIndex]);
        return true;
      default:
        return false;
    }
  }
</script>

{#if mentionOpen}
  <div class="mention-popover" role="listbox" aria-label="File mentions">
    {#if mentionLoading && mentionFiles.length === 0}
      <div class="mention-loading">Searching files…</div>
    {:else if mentionError && mentionFiles.length === 0}
      <div class="mention-empty">{mentionError}</div>
    {:else if mentionFiles.length === 0}
      <div class="mention-empty">No files found</div>
    {:else}
      <ul class="mention-list" bind:this={mentionListEl}>
        {#each mentionFiles.slice(0, 8) as file, i (file)}
          <li
            class="mention-item"
            class:active={i === mentionIndex}
            role="option"
            aria-selected={i === mentionIndex}
            onmousedown={(e) => { e.preventDefault(); selectMentionFile(file); }}
            onmouseenter={() => { mentionIndex = i; }}
          >
            <span class="mention-icon" aria-hidden="true">📄</span>
            <span class="mention-path">{file}</span>
          </li>
        {/each}
      </ul>
      {#if mentionFiles.length > 8}
        <div class="mention-more">{mentionFiles.length - 8} more…</div>
      {/if}
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

  .mention-loading {
    padding: var(--sp-2) var(--sp-3);
    color: var(--fg-dim);
    font-family: var(--font-mono);
    font-size: 0.82em;
  }

  .mention-empty {
    padding: var(--sp-2) var(--sp-3);
    color: var(--fg-dim);
    font-family: var(--font-mono);
    font-size: 0.82em;
    font-style: italic;
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

  .mention-icon {
    flex-shrink: 0;
    font-size: 0.9em;
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
