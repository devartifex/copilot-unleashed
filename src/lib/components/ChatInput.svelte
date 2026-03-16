<script lang="ts">
  import { tick } from 'svelte';
  import type { Attachment, ConnectionState, FileAttachment, SessionMode, UserInputState } from '$lib/types/index.js';
  import { isImageFile, hasImageAttachments as checkImageAttachments } from '$lib/utils/image.js';

  interface Props {
    connectionState: ConnectionState;
    sessionReady: boolean;
    isStreaming: boolean;
    isWaiting: boolean;
    mode: SessionMode;
    supportsVision: boolean;
    pendingUserInput: UserInputState | null;
    onSend: (content: string, attachments?: Attachment[]) => void;
    onAbort: () => void;
    onSetMode: (mode: SessionMode) => void;
    onUserInputResponse: (answer: string, wasFreeform: boolean) => void;
    onFleet?: (prompt: string) => void;
    onNewChat?: () => void;
    onOpenModelSheet?: () => void;
    onCompact?: () => void;
  }

  const MAX_LENGTH = 10_000;
  const MAX_TEXTAREA_HEIGHT = 200;
  const MAX_FILES = 5;
  const ACCEPTED_EXTENSIONS = [
    '.jpg', '.jpeg', '.png', '.gif', '.webp',
    '.ts', '.js', '.py', '.go', '.rs', '.java', '.c', '.cpp', '.h', '.cs', '.rb', '.php',
    '.md', '.txt', '.json', '.yaml', '.yml', '.xml', '.html', '.css', '.csv', '.sql',
  ];

  const {
    connectionState,
    sessionReady,
    isStreaming,
    isWaiting,
    mode,
    supportsVision,
    pendingUserInput,
    onSend,
    onAbort,
    onSetMode,
    onUserInputResponse,
    onFleet,
    onNewChat,
    onOpenModelSheet,
    onCompact,
  }: Props = $props();

  const modes: { value: SessionMode; label: string }[] = [
    { value: 'interactive', label: 'Ask' },
    { value: 'plan', label: 'Plan' },
    { value: 'autopilot', label: 'Agent' },
  ];

  let inputValue = $state('');
  let textareaEl: HTMLTextAreaElement | undefined = $state();
  let fileInputEl: HTMLInputElement | undefined = $state();
  let cameraInputEl: HTMLInputElement | undefined = $state();
  let selectedFiles = $state<File[]>([]);
  let isUploading = $state(false);
  let attachMenuOpen = $state(false);

  // @ file mention autocomplete state
  let mentionOpen = $state(false);
  let mentionQuery = $state('');
  let mentionStartPos = $state(0);
  let mentionFiles = $state<string[]>([]);
  let mentionIndex = $state(0);
  let mentionLoading = $state(false);
  let mentionError = $state('');
  let mentionListEl: HTMLUListElement | undefined = $state();
  let mentionFetchTimer: ReturnType<typeof setTimeout> | undefined;

  // # issue/PR autocomplete state
  interface IssueResult {
    number: number;
    title: string;
    type: 'issue' | 'pr';
    state: string;
    repo?: string;
  }
  let issueOpen = $state(false);
  let issueQuery = $state('');
  let issueStartPos = $state(0);
  let issueResults = $state<IssueResult[]>([]);
  let issueIndex = $state(0);
  let issueLoading = $state(false);
  let issueError = $state('');
  let issueListEl: HTMLUListElement | undefined = $state();
  let issueFetchTimer: ReturnType<typeof setTimeout> | undefined;

  // ? help overlay state
  let showHelp = $state(false);

  const isDisabled = $derived(
    !pendingUserInput && (connectionState !== 'connected' || !sessionReady || isUploading),
  );

  const canSend = $derived(
    pendingUserInput
      ? inputValue.trim().length > 0
      : !isDisabled && (inputValue.trim().length > 0 || selectedFiles.length > 0),
  );

  const inputPlaceholder = $derived.by(() => {
    if (pendingUserInput) return 'Type your answer…';
    if (connectionState === 'connecting') return 'Connecting…';
    if (connectionState === 'reconnecting') return 'Reconnecting…';
    if (connectionState !== 'connected') return 'Not connected';
    if (!sessionReady) return 'Starting session…';
    if (isStreaming) return 'Queue a follow-up…';
    return 'Ask anything…';
  });

  const showSteeringIndicator = $derived(
    !pendingUserInput && isStreaming && inputValue.trim().length > 0,
  );

  const hasImageAttachments = $derived(
    checkImageAttachments(selectedFiles),
  );

  interface SlashCommand {
    cmd: string;
    desc: string;
    action: () => void;
  }

  const slashCommands = $derived.by((): SlashCommand[] => {
    const cmds: SlashCommand[] = [
      { cmd: '/ask', desc: 'Switch to Ask mode', action: () => { onSetMode('interactive'); inputValue = ''; textareaEl?.focus(); } },
      { cmd: '/plan', desc: 'Switch to Plan mode', action: () => { onSetMode('plan'); inputValue = ''; textareaEl?.focus(); } },
      { cmd: '/agent', desc: 'Switch to Agent mode', action: () => { onSetMode('autopilot'); inputValue = ''; textareaEl?.focus(); } },
    ];
    if (onFleet) {
      cmds.push({ cmd: '/fleet', desc: 'Run parallel sub-agents on a task', action: () => { onSetMode('autopilot'); inputValue = '/fleet '; textareaEl?.focus(); } });
    }
    if (onNewChat) {
      cmds.push({ cmd: '/clear', desc: 'Start a new conversation', action: () => { onNewChat(); inputValue = ''; textareaEl?.focus(); } });
    }
    if (onOpenModelSheet) {
      cmds.push({ cmd: '/model', desc: 'Switch model', action: () => { onOpenModelSheet(); inputValue = ''; } });
    }
    if (onCompact) {
      cmds.push({ cmd: '/compact', desc: 'Compact conversation context', action: () => { onCompact(); inputValue = ''; textareaEl?.focus(); } });
    }
    cmds.push(
      { cmd: '@', desc: 'Mention a file', action: () => { inputValue = '@'; textareaEl?.focus(); tick().then(() => detectMention()); } },
      { cmd: '#', desc: 'Reference an issue or PR', action: () => { inputValue = '#'; textareaEl?.focus(); tick().then(() => detectIssue()); } },
      { cmd: '?', desc: 'Show keyboard shortcuts', action: () => { inputValue = ''; showHelp = true; } },
    );
    return cmds;
  });

  const showSlashHint = $derived(
    !pendingUserInput && inputValue.startsWith('/') && !inputValue.includes(' ') && !isDisabled,
  );

  const filteredSlashCommands = $derived.by(() => {
    if (!showSlashHint) return [];
    const typed = inputValue.toLowerCase();
    return slashCommands.filter(c => c.cmd.startsWith(typed) || typed === '/');
  });

  const showHelpTrigger = $derived(
    !pendingUserInput && inputValue === '?' && !isDisabled,
  );

  // Show help overlay when ? is typed on empty input
  $effect(() => {
    if (showHelpTrigger) {
      showHelp = true;
      inputValue = '';
    }
  });

  let slashIndex = $state(0);

  $effect(() => {
    if (showSlashHint) {
      // Clamp index when filtered list changes
      if (slashIndex >= filteredSlashCommands.length) {
        slashIndex = 0;
      }
    } else {
      slashIndex = 0;
    }
  });

  function autoResize() {
    const el = textareaEl;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }

  function handleKeydown(event: KeyboardEvent) {
    // Handle @ mention keyboard navigation first
    if (handleMentionKeydown(event)) return;

    // Handle # issue keyboard navigation
    if (handleIssueKeydown(event)) return;

    // Handle slash command keyboard navigation
    if (showSlashHint && filteredSlashCommands.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        slashIndex = (slashIndex + 1) % filteredSlashCommands.length;
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        slashIndex = (slashIndex - 1 + filteredSlashCommands.length) % filteredSlashCommands.length;
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        filteredSlashCommands[slashIndex].action();
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        inputValue = '';
        return;
      }
      if (event.key === 'Tab') {
        event.preventDefault();
        filteredSlashCommands[slashIndex].action();
        return;
      }
    }

    // Close help overlay on Escape
    if (event.key === 'Escape' && showHelp) {
      event.preventDefault();
      showHelp = false;
      return;
    }

    // Close attach menu on Escape
    if (event.key === 'Escape' && attachMenuOpen) {
      event.preventDefault();
      closeAttachMenu();
      return;
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (pendingUserInput) {
        submitUserInput();
      } else {
        send();
      }
    }
  }

  function submitUserInput(): void {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    onUserInputResponse(trimmed, true);
    inputValue = '';
    if (textareaEl) textareaEl.style.height = 'auto';
  }

  function handleChoiceClick(choice: string): void {
    onUserInputResponse(choice, false);
    inputValue = '';
    if (textareaEl) textareaEl.style.height = 'auto';
  }

  function handleFileSelect() {
    attachMenuOpen = false;
    fileInputEl?.click();
  }

  function handleCameraCapture() {
    attachMenuOpen = false;
    cameraInputEl?.click();
  }

  function handleGallerySelect() {
    attachMenuOpen = false;
    // Use file input with image accept for gallery
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'image/*,video/*';
    input.onchange = (e) => handleFilesChanged(e);
    input.click();
  }

  function toggleAttachMenu() {
    attachMenuOpen = !attachMenuOpen;
  }

  function closeAttachMenu() {
    attachMenuOpen = false;
  }

  function handleFilesChanged(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files) return;

    const newFiles = Array.from(input.files);
    const combined = [...selectedFiles, ...newFiles].slice(0, MAX_FILES);
    selectedFiles = combined;

    // Reset input so same file can be re-selected
    input.value = '';
  }

  function removeFile(index: number) {
    selectedFiles = selectedFiles.filter((_, i) => i !== index);
  }

  async function uploadFiles(files: File[]): Promise<FileAttachment[]> {
    const formData = new FormData();
    for (const file of files) {
      formData.append('files', file);
    }

    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({ message: 'Upload failed' }));
      throw new Error(body.message ?? 'Upload failed');
    }

    const data = await response.json();
    return data.files as FileAttachment[];
  }

  async function send() {
    const trimmed = inputValue.trim();
    if ((!trimmed && selectedFiles.length === 0) || isDisabled) return;

    let attachments: Attachment[] | undefined;

    if (selectedFiles.length > 0) {
      isUploading = true;
      try {
        const uploaded = await uploadFiles(selectedFiles);
        attachments = uploaded.map((f) => ({ type: 'file' as const, path: f.path, name: f.name }));
      } catch (err) {
        console.error('Upload failed:', err);
        isUploading = false;
        return;
      }
      isUploading = false;
    }

    const content = trimmed || 'See attached files';
    onSend(content, attachments);
    inputValue = '';
    selectedFiles = [];
    if (textareaEl) {
      textareaEl.style.height = 'auto';
    }
  }

  function handleInput() {
    if (inputValue.length > MAX_LENGTH) {
      inputValue = inputValue.slice(0, MAX_LENGTH);
    }
    autoResize();
    detectMention();
    detectIssue();
  }

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

  function detectMention() {
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
        autoResize();
      }
    });
  }

  function handleMentionKeydown(event: KeyboardEvent): boolean {
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

  function scrollMentionIntoView() {
    tick().then(() => {
      if (!mentionListEl) return;
      const active = mentionListEl.querySelector('[aria-selected="true"]');
      active?.scrollIntoView({ block: 'nearest' });
    });
  }

  // ── # Issue/PR autocomplete ─────────────────────────────────────
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

  function detectIssue() {
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
        autoResize();
      }
    });
  }

  function handleIssueKeydown(event: KeyboardEvent): boolean {
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

  function scrollIssueIntoView() {
    tick().then(() => {
      if (!issueListEl) return;
      const active = issueListEl.querySelector('[aria-selected="true"]');
      active?.scrollIntoView({ block: 'nearest' });
    });
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  }

  // Auto-resize when inputValue changes externally
  $effect(() => {
    inputValue;
    autoResize();
  });

  // Focus textarea when user input request appears
  $effect(() => {
    if (pendingUserInput && textareaEl) {
      textareaEl.focus();
    }
  });

  // Virtual keyboard handling — update --vh CSS variable
  $effect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    function onResize() {
      const vh = viewport?.height ?? window.innerHeight;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
    }

    onResize();
    viewport.addEventListener('resize', onResize);

    return () => {
      viewport.removeEventListener('resize', onResize);
    };
  });
</script>

<div class="input-area">
  <input
    bind:this={fileInputEl}
    type="file"
    multiple
    accept={ACCEPTED_EXTENSIONS.join(',')}
    onchange={handleFilesChanged}
    class="file-input-hidden"
    aria-hidden="true"
    tabindex={-1}
  />
  <input
    bind:this={cameraInputEl}
    type="file"
    accept="image/*"
    capture="environment"
    onchange={handleFilesChanged}
    class="file-input-hidden"
    aria-hidden="true"
    tabindex={-1}
  />

  <div class="input-container" class:user-input-active={!!pendingUserInput}>
    {#if pendingUserInput}
      <div class="user-input-banner">
        <span class="user-input-question">{pendingUserInput.question}</span>
        {#if pendingUserInput.choices && pendingUserInput.choices.length > 0}
          <div class="user-input-choices">
            {#each pendingUserInput.choices as choice (choice)}
              <button class="user-input-choice" onclick={() => handleChoiceClick(choice)}>{choice}</button>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    {#if selectedFiles.length > 0}
      <div class="file-preview-row">
        {#each selectedFiles as file, i (file.name + i)}
          <div class="file-chip">
            {#if isImageFile(file)}
              <img
                class="file-chip-thumb"
                src={URL.createObjectURL(file)}
                alt={file.name}
                onload={(e) => URL.revokeObjectURL((e.currentTarget as HTMLImageElement).src)}
              />
            {:else}
              <span class="file-chip-icon" aria-hidden="true">📄</span>
            {/if}
            <span class="file-chip-name">{file.name}</span>
            {#if !isImageFile(file)}
              <span class="file-chip-size">{formatFileSize(file.size)}</span>
            {/if}
            <button class="file-chip-remove" onclick={() => removeFile(i)} aria-label="Remove {file.name}">×</button>
          </div>
        {/each}
      </div>
      {#if hasImageAttachments && !supportsVision}
        <div class="vision-warning" role="alert">
          ⚠️ Current model may not support image analysis
        </div>
      {/if}
    {/if}

    <textarea
      bind:this={textareaEl}
      bind:value={inputValue}
      placeholder={inputPlaceholder}
      disabled={!pendingUserInput && isDisabled}
      maxlength={MAX_LENGTH}
      rows={2}
      oninput={handleInput}
      onkeydown={handleKeydown}
    ></textarea>

    {#if showSlashHint && filteredSlashCommands.length > 0}
      <div class="slash-hint" role="listbox" aria-label="Slash commands">
        {#each filteredSlashCommands as cmd, i (cmd.cmd)}
          <button
            class="slash-option"
            class:active={i === slashIndex}
            role="option"
            aria-selected={i === slashIndex}
            onclick={() => cmd.action()}
            onmouseenter={() => { slashIndex = i; }}
          >
            <span class="slash-cmd">{cmd.cmd}</span>
            <span class="slash-desc">{cmd.desc}</span>
          </button>
        {/each}
      </div>
    {/if}

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

    {#if showSteeringIndicator}
      <div class="steering-indicator" role="status" aria-live="polite">
        Message will be queued and sent when the current response completes.
      </div>
    {/if}

    <div class="toolbar">
      <div class="toolbar-left">
        {#if !pendingUserInput}
          <div class="attach-wrapper">
          <button
            class="icon-btn attach-btn"
            onclick={toggleAttachMenu}
            disabled={isDisabled || selectedFiles.length >= MAX_FILES}
            aria-label="Attach"
            aria-expanded={attachMenuOpen}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
              <line x1="9" y1="4" x2="9" y2="14"/>
              <line x1="4" y1="9" x2="14" y2="9"/>
            </svg>
          </button>

          {#if attachMenuOpen}
            <!-- a11y: presentation backdrop — click-to-dismiss is a mouse convenience; keyboard Escape handled by attach menu -->
            <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
            <div class="attach-backdrop" onclick={closeAttachMenu} role="presentation"></div>
            <div class="attach-menu" role="menu">
              <button class="attach-menu-item" role="menuitem" onclick={handleCameraCapture}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="1" y="4" width="14" height="10" rx="2"/>
                  <circle cx="8" cy="9" r="2.5"/>
                  <path d="M5.5 4 L6.5 2 L9.5 2 L10.5 4"/>
                </svg>
                Camera
              </button>
              <button class="attach-menu-item" role="menuitem" onclick={handleGallerySelect}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="1" y="2" width="14" height="12" rx="2"/>
                  <circle cx="5" cy="6" r="1.5"/>
                  <path d="M1 12 L5 8 L8 11 L11 7 L15 12"/>
                </svg>
                Gallery
              </button>
              <button class="attach-menu-item" role="menuitem" onclick={handleFileSelect}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M9 1 L3 1 C2.4 1 2 1.4 2 2 L2 14 C2 14.6 2.4 15 3 15 L13 15 C13.6 15 14 14.6 14 14 L14 6 Z"/>
                  <path d="M9 1 L9 6 L14 6"/>
                </svg>
                File
              </button>
            </div>
          {/if}
        </div>

        {/if}

        <div class="mode-selector">
          {#each modes as m (m.value)}
            <button
              class="mode-btn"
              class:active={mode === m.value}
              onclick={() => onSetMode(m.value)}
              disabled={isDisabled && !pendingUserInput}
              aria-label="{m.label} mode"
            >
              {m.label}
            </button>
          {/each}
        </div>
      </div>

      <div class="toolbar-right">
        {#if isStreaming || isWaiting}
          {#if !pendingUserInput && canSend}
            <button class="circle-btn send-btn" onclick={send} aria-label="Queue message" disabled={!inputValue.trim()}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M8 12 L8 4"/>
                <path d="M4 7 L8 3 L12 7"/>
              </svg>
            </button>
          {/if}
          <button class="circle-btn stop-btn" onclick={onAbort} aria-label="Stop generating">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <rect x="2" y="2" width="10" height="10" rx="2"/>
            </svg>
          </button>
        {:else}
          <button
            class="circle-btn send-btn"
            onclick={pendingUserInput ? submitUserInput : send}
            disabled={!canSend}
            aria-label={pendingUserInput ? 'Send answer' : 'Send message'}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M8 12 L8 4"/>
              <path d="M4 7 L8 3 L12 7"/>
            </svg>
          </button>
        {/if}
      </div>
    </div>
  </div>
</div>

{#if showHelp}
  <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
  <div class="help-backdrop" onclick={() => showHelp = false} role="presentation"></div>
  <div class="help-overlay" role="dialog" aria-label="Keyboard shortcuts">
    <div class="help-header">
      <h2>Keyboard Shortcuts</h2>
      <button class="help-close" onclick={() => showHelp = false} aria-label="Close">×</button>
    </div>
    <div class="help-body">
      <div class="help-section">
        <h3>Commands</h3>
        <div class="help-row"><kbd>/</kbd><span>Open command palette</span></div>
        <div class="help-row"><kbd>@</kbd><span>Mention a file</span></div>
        <div class="help-row"><kbd>#</kbd><span>Reference an issue or PR</span></div>
        <div class="help-row"><kbd>?</kbd><span>Show this help</span></div>
      </div>
      <div class="help-section">
        <h3>Input</h3>
        <div class="help-row"><kbd>Enter</kbd><span>Send message</span></div>
        <div class="help-row"><kbd>Shift + Enter</kbd><span>New line</span></div>
        <div class="help-row"><kbd>Escape</kbd><span>Close menu / overlay</span></div>
      </div>
      <div class="help-section">
        <h3>Menus</h3>
        <div class="help-row"><kbd>↑ ↓</kbd><span>Navigate options</span></div>
        <div class="help-row"><kbd>Enter / Tab</kbd><span>Select option</span></div>
        <div class="help-row"><kbd>Escape</kbd><span>Dismiss</span></div>
      </div>
      <div class="help-section">
        <h3>Slash Commands</h3>
        <div class="help-row"><kbd>/ask</kbd><span>Ask mode</span></div>
        <div class="help-row"><kbd>/plan</kbd><span>Plan mode</span></div>
        <div class="help-row"><kbd>/agent</kbd><span>Agent mode</span></div>
        <div class="help-row"><kbd>/fleet</kbd><span>Parallel sub-agents</span></div>
        <div class="help-row"><kbd>/clear</kbd><span>New conversation</span></div>
        <div class="help-row"><kbd>/model</kbd><span>Switch model</span></div>
        <div class="help-row"><kbd>/compact</kbd><span>Compact context</span></div>
      </div>
    </div>
  </div>
{/if}

<style>
  .input-area {
    flex-shrink: 0;
    padding: var(--sp-2) var(--sp-2) calc(var(--sp-2) + var(--safe-bottom));
    background: var(--bg);
    position: relative;
  }

  .input-container {
    background: var(--bg-overlay);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    overflow: hidden;
    transition: border-color 0.15s ease;
  }

  .input-container:focus-within {
    border-color: var(--mode-color, var(--purple-dim));
  }

  .input-container.user-input-active {
    border-color: var(--purple);
  }

  /* ── User input prompt (inline) ─────────────────────────────────── */
  .user-input-banner {
    padding: var(--sp-2) var(--sp-3) 0;
    animation: userInputIn 0.2s ease;
  }

  @keyframes userInputIn {
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .user-input-question {
    display: block;
    color: var(--purple);
    font-weight: 500;
    font-size: 0.85em;
    font-family: var(--font-mono);
    line-height: 1.4;
  }

  .user-input-choices {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-1);
    margin-top: var(--sp-2);
  }

  .user-input-choice {
    background: rgba(110, 64, 201, 0.12);
    border: 1px solid rgba(110, 64, 201, 0.30);
    border-radius: var(--radius-sm);
    color: var(--purple);
    font-family: var(--font-mono);
    font-size: 0.78em;
    padding: 4px 10px;
    cursor: pointer;
    transition: all 0.12s ease;
    -webkit-tap-highlight-color: transparent;
    min-height: 32px;
  }

  .user-input-choice:active {
    background: rgba(110, 64, 201, 0.25);
    transform: scale(0.96);
  }

  /* ── Textarea ───────────────────────────────────────────────────── */
  textarea {
    display: block;
    width: 100%;
    background: transparent;
    border: none;
    color: var(--fg);
    font-size: max(16px, var(--font-size));
    font-family: var(--font-mono);
    resize: none;
    outline: none;
    max-height: 200px;
    line-height: 1.5;
    padding: var(--sp-3) var(--sp-4) var(--sp-1);
    -webkit-appearance: none;
    appearance: none;
    min-height: 52px;
    /* Hide scrollbar but keep scrolling */
    scrollbar-width: none;
  }

  textarea::-webkit-scrollbar {
    display: none;
  }

  textarea::placeholder {
    color: var(--fg-dim);
    font-size: 0.88em;
  }

  textarea:disabled {
    opacity: 0.4;
  }

  textarea:disabled::placeholder {
    animation: inputLoading 1.5s ease-in-out infinite;
  }

  @keyframes inputLoading {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 0.8; }
  }

  /* ── Toolbar row: [ +attach / mode selector ] ─────────── [ send/stop ] ─ */
  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--sp-1) var(--sp-2) var(--sp-2);
    gap: var(--sp-2);
  }

  .toolbar-left {
    display: flex;
    align-items: center;
    gap: var(--sp-1);
    flex: 1;
    min-width: 0;
  }

  .steering-indicator {
    padding: 0 var(--sp-4);
    color: var(--fg-dim);
    font-family: var(--font-mono);
    font-size: 0.75em;
    line-height: 1.4;
  }

  .slash-hint {
    position: absolute;
    bottom: 100%;
    left: var(--sp-2);
    right: var(--sp-2);
    background: var(--bg-overlay);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: var(--sp-1);
    margin-bottom: var(--sp-1);
    z-index: 10;
    animation: userInputIn 0.15s ease;
  }

  .slash-option {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    width: 100%;
    padding: var(--sp-2) var(--sp-3);
    border: none;
    border-radius: var(--radius);
    background: transparent;
    color: var(--fg);
    cursor: pointer;
    text-align: left;
    font-size: 0.85em;
  }

  .slash-option:hover,
  .slash-option.active {
    background: var(--bg-secondary);
  }

  .slash-cmd {
    font-family: var(--font-mono);
    font-weight: 600;
    color: var(--purple);
  }

  .slash-desc {
    color: var(--fg-muted);
  }

  /* ── @ File mention popover ────────────────────────────────────── */
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
    animation: userInputIn 0.12s ease;
    overflow: hidden;
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

  /* ── # Issue autocomplete ──────────────────────────────────────── */
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

  /* ── ? Help overlay ──────────────────────────────────────────── */
  .help-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 100;
  }

  .help-overlay {
    position: fixed;
    bottom: 80px;
    left: 50%;
    transform: translateX(-50%);
    width: min(480px, calc(100% - 2rem));
    background: var(--bg-raised, var(--bg-overlay));
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    z-index: 101;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    animation: userInputIn 0.15s ease;
    max-height: 70vh;
    overflow-y: auto;
    scrollbar-width: thin;
  }

  .help-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--sp-3) var(--sp-4);
    border-bottom: 1px solid var(--border);
  }

  .help-header h2 {
    margin: 0;
    font-size: 1em;
    font-weight: 600;
    color: var(--fg);
  }

  .help-close {
    background: none;
    border: none;
    color: var(--fg-muted);
    font-size: 1.4em;
    cursor: pointer;
    padding: 0 var(--sp-1);
    line-height: 1;
  }

  .help-close:hover {
    color: var(--fg);
  }

  .help-body {
    padding: var(--sp-3) var(--sp-4);
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--sp-3);
  }

  @media (max-width: 480px) {
    .help-body {
      grid-template-columns: 1fr;
    }
  }

  .help-section h3 {
    margin: 0 0 var(--sp-2);
    font-size: 0.8em;
    font-weight: 600;
    color: var(--fg-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .help-row {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    padding: var(--sp-1) 0;
    font-size: 0.82em;
    color: var(--fg);
  }

  .help-row kbd {
    display: inline-block;
    min-width: 28px;
    padding: 2px 6px;
    background: var(--bg-overlay);
    border: 1px solid var(--border);
    border-radius: 4px;
    font-family: var(--font-mono);
    font-size: 0.85em;
    text-align: center;
    color: var(--purple);
    white-space: nowrap;
  }

  .help-row span {
    color: var(--fg-muted);
  }

  .toolbar-right {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    flex-shrink: 0;
  }

  /* ── Icon button (attach) ──────────────────────────────────────── */
  .icon-btn {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    border: none;
    background: transparent;
    color: var(--fg-muted);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: all 0.15s ease;
    -webkit-tap-highlight-color: transparent;
  }

  .icon-btn:hover {
    background: var(--border);
    color: var(--fg);
  }

  .icon-btn:active {
    transform: scale(0.92);
    background: var(--border);
    color: var(--fg);
  }

  .icon-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  /* ── Mode selector (inline pill toggle) ─────────────────────────── */
  .mode-selector {
    display: flex;
    align-items: center;
    gap: 2px;
    background: rgba(255, 255, 255, 0.06);
    border-radius: var(--radius-sm);
    padding: 2px;
  }

  .mode-btn {
    background: transparent;
    border: none;
    color: var(--fg-dim);
    font-family: var(--font-mono);
    font-size: 0.8em;
    padding: 4px 10px;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s ease;
    -webkit-tap-highlight-color: transparent;
    white-space: nowrap;
    line-height: 1.4;
  }

  .mode-btn.active {
    background: var(--mode-color, var(--purple-dim));
    color: var(--bg);
  }

  .mode-btn:not(.active):hover {
    color: var(--fg-muted);
    background: rgba(255, 255, 255, 0.06);
  }

  .mode-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  /* ── Circle buttons (send, stop) ───────────────────────────────── */
  .circle-btn {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: all 0.15s ease;
    -webkit-tap-highlight-color: transparent;
  }

  .circle-btn:active {
    transform: scale(0.92);
  }

  /* ── Attach menu ───────────────────────────────────────────────── */
  .attach-wrapper {
    position: relative;
    flex-shrink: 0;
  }

  .attach-backdrop {
    position: fixed;
    inset: 0;
    z-index: 10;
  }

  .attach-menu {
    position: absolute;
    bottom: calc(100% + var(--sp-2));
    left: 0;
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    overflow: hidden;
    z-index: 11;
    min-width: 160px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
    animation: menuFadeIn 0.12s ease;
  }

  @keyframes menuFadeIn {
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .attach-menu-item {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    width: 100%;
    background: none;
    border: none;
    color: var(--fg);
    font-family: var(--font-mono);
    font-size: 0.85em;
    padding: var(--sp-2) var(--sp-3);
    cursor: pointer;
    min-height: 44px;
    text-align: left;
    -webkit-tap-highlight-color: transparent;
  }

  .attach-menu-item:active {
    background: var(--border);
  }

  .attach-menu-item + .attach-menu-item {
    border-top: 1px solid var(--border);
  }

  /* Send */
  .send-btn {
    background: var(--mode-color, var(--purple));
    color: var(--bg);
  }

  .send-btn:disabled {
    background: transparent;
    color: var(--fg-dim);
    opacity: 0.4;
    cursor: not-allowed;
  }

  .send-btn:not(:disabled):active {
    opacity: 0.85;
  }

  /* Stop */
  .stop-btn {
    background: var(--red);
    color: #fff;
  }

  .stop-btn:active {
    opacity: 0.8;
  }

  /* ── Hidden file input ─────────────────────────────────────────── */
  .file-input-hidden {
    position: absolute;
    width: 0;
    height: 0;
    overflow: hidden;
    opacity: 0;
    pointer-events: none;
  }

  /* ── File preview chips ────────────────────────────────────────── */
  .file-preview-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-1);
    padding: 0 0 var(--sp-2);
    overflow-x: auto;
    scrollbar-width: none;
  }

  .file-preview-row::-webkit-scrollbar {
    display: none;
  }

  .file-chip {
    display: flex;
    align-items: center;
    gap: var(--sp-1);
    background: var(--bg-overlay);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 2px var(--sp-2);
    font-size: 0.78em;
    font-family: var(--font-mono);
    color: var(--fg-dim);
    max-width: 180px;
  }

  .file-chip-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
  }

  .file-chip-size {
    flex-shrink: 0;
    opacity: 0.7;
  }

  .file-chip-remove {
    background: none;
    border: none;
    color: var(--fg-muted);
    font-size: 1.1em;
    padding: 0 2px;
    cursor: pointer;
    line-height: 1;
    flex-shrink: 0;
  }

  .file-chip-remove:active {
    color: var(--red);
  }

  .file-chip-icon {
    flex-shrink: 0;
    font-size: 0.9em;
  }

  .file-chip-thumb {
    width: 28px;
    height: 28px;
    object-fit: cover;
    border-radius: 4px;
    flex-shrink: 0;
  }

  .vision-warning {
    padding: 0 var(--sp-3) var(--sp-2);
    color: var(--yellow);
    font-family: var(--font-mono);
    font-size: 0.75em;
    line-height: 1.4;
  }
</style>
