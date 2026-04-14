<script lang="ts">
  import type { Attachment, ConnectionState, FileAttachment, SessionMode, UserInputState } from '$lib/types/index.js';
  import MentionAutocomplete from '$lib/components/chat/MentionAutocomplete.svelte';
  import IssueAutocomplete from '$lib/components/chat/IssueAutocomplete.svelte';
  import PromptAutocomplete from '$lib/components/chat/PromptAutocomplete.svelte';
  import SlashCommandPalette from '$lib/components/chat/SlashCommandPalette.svelte';
  import AttachmentManager from '$lib/components/chat/AttachmentManager.svelte';
  import KeyboardShortcutsHelp from '$lib/components/chat/KeyboardShortcutsHelp.svelte';
  import VoiceInput from '$lib/components/chat/VoiceInput.svelte';

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
    onOpenSessions?: () => void;
    onOpenSettings?: () => void;
    prompts?: Array<{ name: string; description: string; content: string }>;
    voiceInputEnabled?: boolean;
  }

  const MAX_LENGTH = 10_000;
  const MAX_TEXTAREA_HEIGHT = 200;
  const MAX_FILES = 5;

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
    onOpenSessions,
    onOpenSettings,
    prompts = [],
    voiceInputEnabled = true,
  }: Props = $props();

  const modes: { value: SessionMode; label: string }[] = [
    { value: 'interactive', label: 'Ask' },
    { value: 'plan', label: 'Plan' },
    { value: 'autopilot', label: 'Agent' },
  ];

  let inputValue = $state('');
  let textareaEl: HTMLTextAreaElement | undefined = $state();
  let selectedFiles = $state<File[]>([]);
  let isUploading = $state(false);
  let showHelp = $state(false);

  // Attach menu state (button lives in parent toolbar)
  let attachMenuOpen = $state(false);
  let attachBtnEl: HTMLButtonElement | undefined = $state();
  let attachMenuX = $state(0);
  let attachMenuY = $state(0);

  // Sub-component references
  let mentionComp: MentionAutocomplete;
  let issueComp: IssueAutocomplete;
  let promptComp: PromptAutocomplete;
  let slashComp: SlashCommandPalette;
  let attachComp: AttachmentManager;

  // Voice input: interim text shown while user is speaking
  let voiceInterim = $state('');

  function handleVoiceTranscript(text: string) {
    voiceInterim = '';
    const separator = inputValue.length > 0 && !inputValue.endsWith(' ') ? ' ' : '';
    inputValue += separator + text;
    requestAnimationFrame(autoResize);
    textareaEl?.focus();
  }

  function handleVoiceInterim(text: string) {
    voiceInterim = text;
  }

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

  const showSlashHint = $derived(
    !pendingUserInput && inputValue.startsWith('/') && !inputValue.includes(' ') && !isDisabled,
  );

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

  function autoResize() {
    const el = textareaEl;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }

  function handleKeydown(event: KeyboardEvent) {
    // Handle / prompt keyboard navigation first
    if (promptComp?.handleKeydown(event)) return;

    // Handle @ mention keyboard navigation first
    if (mentionComp?.handleKeydown(event)) return;

    // Handle # issue keyboard navigation
    if (issueComp?.handleKeydown(event)) return;

    // Handle slash command keyboard navigation
    if (slashComp?.handleKeydown(event)) return;

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

  function toggleAttachMenu() {
    if (!attachMenuOpen && attachBtnEl) {
      const rect = attachBtnEl.getBoundingClientRect();
      attachMenuX = rect.left;
      attachMenuY = rect.top;
    }
    attachMenuOpen = !attachMenuOpen;
  }

  function closeAttachMenu() {
    attachMenuOpen = false;
  }

  function handleFileSelect() {
    attachMenuOpen = false;
    // Delay native picker so iOS dismisses the menu first
    requestAnimationFrame(() => attachComp?.openFileSelect());
  }

  function handleCameraCapture() {
    attachMenuOpen = false;
    requestAnimationFrame(() => attachComp?.openCamera());
  }

  function handleGallerySelect() {
    attachMenuOpen = false;
    requestAnimationFrame(() => attachComp?.openGallery());
  }

  async function send() {
    const trimmed = inputValue.trim();
    if ((!trimmed && selectedFiles.length === 0) || isDisabled) return;

    let attachments: Attachment[] | undefined;

    if (selectedFiles.length > 0) {
      isUploading = true;
      try {
        const uploaded = await attachComp.uploadFiles(selectedFiles);
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
    mentionComp?.detect();
    issueComp?.detect();
    promptComp?.detect();
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

    function onViewportChange() {
      const vh = viewport?.height ?? window.innerHeight;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
    }

    onViewportChange();
    viewport.addEventListener('resize', onViewportChange);
    viewport.addEventListener('scroll', onViewportChange);

    return () => {
      viewport.removeEventListener('resize', onViewportChange);
      viewport.removeEventListener('scroll', onViewportChange);
    };
  });

  // ── Paste & drop handlers ────────────────────────────────────────
  let isDragging = $state(false);

  function extractFiles(dataTransfer: DataTransfer | null): File[] {
    if (!dataTransfer) return [];
    // No MIME filter — browsers report empty or generic types for code files.
    // AttachmentManager + server-side allowlist are the source of truth.
    return Array.from(dataTransfer.files);
  }

  function handlePaste(event: ClipboardEvent) {
    const files = extractFiles(event.clipboardData);
    if (files.length === 0) return;
    event.preventDefault();
    attachComp?.addFiles(files.slice(0, MAX_FILES - selectedFiles.length));
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    isDragging = false;
    const files = extractFiles(event.dataTransfer);
    if (files.length === 0) return;
    attachComp?.addFiles(files.slice(0, MAX_FILES - selectedFiles.length));
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    isDragging = true;
  }

  function handleDragLeave(event: DragEvent) {
    // Only clear when leaving the container, not entering a child
    if (event.currentTarget instanceof HTMLElement && event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
    isDragging = false;
  }

  // Force viewport recalc on textarea focus (iOS keyboard animation delay)
  function handleTextareaFocus() {
    const viewport = window.visualViewport;
    if (!viewport) return;
    // Schedule two updates to catch keyboard animation start and settle
    requestAnimationFrame(() => {
      document.documentElement.style.setProperty('--vh', `${viewport.height}px`);
    });
    setTimeout(() => {
      document.documentElement.style.setProperty('--vh', `${viewport.height}px`);
    }, 300);
  }
</script>

<div class="input-area">
  <AttachmentManager
    bind:this={attachComp}
    bind:selectedFiles
    {supportsVision}
  />

  <div
    class="input-container"
    class:user-input-active={!!pendingUserInput}
    class:drag-over={isDragging}
    ondrop={handleDrop}
    ondragover={handleDragOver}
    ondragleave={handleDragLeave}
    role="presentation"
  >
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

    <textarea
      class="scrollbar-hidden"
      bind:this={textareaEl}
      bind:value={inputValue}
      placeholder={inputPlaceholder}
      disabled={!pendingUserInput && isDisabled}
      maxlength={MAX_LENGTH}
      rows={2}
      oninput={handleInput}
      onkeydown={handleKeydown}
      onfocus={handleTextareaFocus}
      onpaste={handlePaste}
    ></textarea>

    {#if voiceInterim}
      <div class="voice-interim" role="status" aria-live="polite">{voiceInterim}</div>
    {/if}

    <SlashCommandPalette
      bind:this={slashComp}
      bind:inputValue
      {textareaEl}
      {showSlashHint}
      {onSetMode}
      {onFleet}
      {onNewChat}
      {onOpenModelSheet}
      {onCompact}
      {onOpenSessions}
      {onOpenSettings}
      onDetectMention={() => mentionComp?.detect()}
      onDetectIssue={() => issueComp?.detect()}
      onShowHelp={() => { showHelp = true; }}
    />

    <PromptAutocomplete
      bind:this={promptComp}
      bind:inputValue
      {textareaEl}
      {prompts}
      {showSlashHint}
      onAutoResize={autoResize}
    />

    <MentionAutocomplete
      bind:this={mentionComp}
      bind:inputValue
      {textareaEl}
      onAutoResize={autoResize}
    />

    <IssueAutocomplete
      bind:this={issueComp}
      bind:inputValue
      {textareaEl}
      onAutoResize={autoResize}
    />

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
            bind:this={attachBtnEl}
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
            <div class="attach-menu" role="menu" style="left:{attachMenuX}px;top:{attachMenuY}px">
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

          {#if voiceInputEnabled}
            <VoiceInput
              onTranscript={handleVoiceTranscript}
              onInterim={handleVoiceInterim}
              disabled={!pendingUserInput && isDisabled}
            />
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

<KeyboardShortcutsHelp bind:showHelp />

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

  .input-container.drag-over {
    border-color: var(--purple);
    background: color-mix(in srgb, var(--purple) 8%, var(--bg-overlay));
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

  /* ── Toolbar row ────────────────────────────────────────────────── */
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

  .toolbar-right {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    flex-shrink: 0;
  }

  .steering-indicator {
    padding: 0 var(--sp-4);
    color: var(--fg-dim);
    font-size: 0.75em;
    line-height: 1.4;
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
    position: fixed;
    transform: translateY(calc(-100% - var(--sp-2)));
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    overflow: hidden;
    z-index: 1000;
    min-width: 160px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
    animation: menuFadeIn 0.12s ease;
  }

  @keyframes menuFadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .attach-menu-item {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    width: 100%;
    background: none;
    border: none;
    color: var(--fg);
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

  /* ── Voice interim preview ──────────────────────────────────────── */
  .voice-interim {
    padding: 0 var(--sp-4) var(--sp-1);
    color: var(--fg-dim);
    font-size: 0.82em;
    font-style: italic;
    line-height: 1.4;
    opacity: 0.7;
    animation: voiceInterimPulse 1.2s ease-in-out infinite;
  }

  @keyframes voiceInterimPulse {
    0%, 100% { opacity: 0.5; }
    50% { opacity: 0.8; }
  }
</style>
