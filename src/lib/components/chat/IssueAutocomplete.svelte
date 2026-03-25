<script lang="ts">
  import { tick } from 'svelte';

  interface IssueResult {
    number: number;
    title: string;
    type: 'issue' | 'pr';
    state: string;
    repo?: string;
  }

  interface Props {
    inputValue: string;
    textareaEl: HTMLTextAreaElement | undefined;
    onAutoResize: () => void;
  }

  let { inputValue = $bindable(), textareaEl, onAutoResize }: Props = $props();

  let issueOpen = $state(false);
  let issueQuery = $state('');
  let issueStartPos = $state(0);
  let issueResults = $state<IssueResult[]>([]);
  let issueIndex = $state(0);
  let issueLoading = $state(false);
  let issueError = $state('');
  let issueListEl: HTMLUListElement | undefined = $state();
  let issueFetchTimer: ReturnType<typeof setTimeout> | undefined;

  async function fetchIssues(query: string) {
    issueLoading = true;
    issueError = '';
    try {
      const params = query ? `?q=${encodeURIComponent(query)}` : '';
      const res = await fetch(`/api/issues${params}`);
      if (!res.ok) {
        issueResults = [];
        issueError = res.status === 401 ? 'Not authenticated' : 'Failed to load issues';
        return;
      }
      const data = await res.json();
      issueResults = Array.isArray(data.items) ? data.items : [];
      issueError = data.error ?? '';
      issueIndex = 0;
    } catch {
      issueResults = [];
      issueError = 'Failed to load issues';
    } finally {
      issueLoading = false;
    }
  }

  function closeIssue() {
    issueOpen = false;
    issueResults = [];
    issueQuery = '';
    issueIndex = 0;
    issueError = '';
    if (issueFetchTimer) {
      clearTimeout(issueFetchTimer);
      issueFetchTimer = undefined;
    }
  }

  function selectIssue(issue: IssueResult) {
    if (!textareaEl) return;
    const before = inputValue.slice(0, issueStartPos);
    const after = inputValue.slice(textareaEl.selectionStart);
    const ref = issue.repo ? `${issue.repo}#${issue.number}` : `#${issue.number}`;
    inputValue = `${before}${ref}${after ? '' : ' '}${after}`;
    closeIssue();
    tick().then(() => {
      if (textareaEl) {
        const newPos = before.length + ref.length + (after ? 0 : 1);
        textareaEl.selectionStart = newPos;
        textareaEl.selectionEnd = newPos;
        textareaEl.focus();
        onAutoResize();
      }
    });
  }

  function scrollIssueIntoView() {
    tick().then(() => {
      if (!issueListEl) return;
      const active = issueListEl.querySelector('[aria-selected="true"]');
      active?.scrollIntoView({ block: 'nearest' });
    });
  }

  export function detect() {
    if (!textareaEl) return;
    const pos = textareaEl.selectionStart;
    const text = inputValue.slice(0, pos);

    const lastHash = text.lastIndexOf('#');
    if (lastHash === -1) {
      closeIssue();
      return;
    }

    if (lastHash > 0 && !/\s/.test(text[lastHash - 1])) {
      closeIssue();
      return;
    }

    const query = text.slice(lastHash + 1);
    if (/\s/.test(query)) {
      closeIssue();
      return;
    }

    issueStartPos = lastHash;
    issueQuery = query;
    issueOpen = true;
    issueLoading = true;

    if (issueFetchTimer) clearTimeout(issueFetchTimer);
    issueFetchTimer = setTimeout(() => fetchIssues(query), 250);
  }

  export function handleKeydown(event: KeyboardEvent): boolean {
    if (!issueOpen) return false;

    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        closeIssue();
        return true;
      case 'ArrowDown':
        if (issueResults.length === 0) return false;
        event.preventDefault();
        issueIndex = (issueIndex + 1) % issueResults.length;
        scrollIssueIntoView();
        return true;
      case 'ArrowUp':
        if (issueResults.length === 0) return false;
        event.preventDefault();
        issueIndex = (issueIndex - 1 + issueResults.length) % issueResults.length;
        scrollIssueIntoView();
        return true;
      case 'Enter':
      case 'Tab':
        if (issueResults.length === 0) return false;
        event.preventDefault();
        selectIssue(issueResults[issueIndex]);
        return true;
      default:
        return false;
    }
  }
</script>

{#if issueOpen}
  <div class="mention-popover" role="listbox" aria-label="Issues and pull requests">
    {#if issueLoading && issueResults.length === 0}
      <div class="mention-loading">Searching issues…</div>
    {:else if issueError && issueResults.length === 0}
      <div class="mention-empty">{issueError}</div>
    {:else if issueResults.length === 0}
      <div class="mention-empty">No issues found</div>
    {:else}
      <ul class="mention-list" bind:this={issueListEl}>
        {#each issueResults.slice(0, 8) as issue, i (`${issue.repo ?? ''}#${issue.number}`)}
          <li
            class="mention-item"
            class:active={i === issueIndex}
            role="option"
            aria-selected={i === issueIndex}
            onmousedown={(e) => { e.preventDefault(); selectIssue(issue); }}
            onmouseenter={() => { issueIndex = i; }}
          >
            <span class="issue-icon" aria-hidden="true">{issue.type === 'pr' ? '⑂' : '●'}</span>
            {#if issue.repo}
              <span class="issue-repo">{issue.repo}</span>
            {/if}
            <span class="issue-number">#{issue.number}</span>
            <span class="mention-path">{issue.title}</span>
            <span class="issue-state" class:open={issue.state === 'open'} class:closed={issue.state !== 'open'}>{issue.state}</span>
          </li>
        {/each}
      </ul>
      {#if issueResults.length > 8}
        <div class="mention-more">{issueResults.length - 8} more…</div>
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

  .issue-icon {
    flex-shrink: 0;
    font-size: 0.9em;
  }

  .issue-repo {
    flex-shrink: 0;
    font-family: var(--font-mono);
    font-size: 0.75em;
    color: var(--fg-dim);
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .issue-number {
    flex-shrink: 0;
    font-family: var(--font-mono);
    font-weight: 600;
    color: var(--purple);
    font-size: 0.85em;
  }

  .issue-state {
    flex-shrink: 0;
    font-family: var(--font-mono);
    font-size: 0.7em;
    padding: 1px 6px;
    border-radius: 10px;
    margin-left: auto;
  }

  .issue-state.open {
    color: var(--green, #3fb950);
    background: rgba(63, 185, 80, 0.15);
  }

  .issue-state.closed {
    color: var(--purple);
    background: rgba(163, 113, 247, 0.15);
  }
</style>
