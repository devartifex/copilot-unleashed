<script lang="ts">
  import type { ConnectionState, SessionMode, FileAttachment } from '$lib/types/index.js';

  interface Props {
    connectionState: ConnectionState;
    sessionReady: boolean;
    isStreaming: boolean;
    mode: SessionMode;
    currentModel: string;
    onSend: (content: string, attachments?: Array<{ path: string; name: string; type: string }>) => void;
    onAbort: () => void;
    onToggleSidebar: () => void;
  }

  const MAX_LENGTH = 10_000;
  const MAX_TEXTAREA_HEIGHT = 120;
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
    mode,
    currentModel,
    onSend,
    onAbort,
    onToggleSidebar,
  }: Props = $props();

  let inputValue = $state('');
  let textareaEl: HTMLTextAreaElement | undefined = $state();
  let fileInputEl: HTMLInputElement | undefined = $state();
  let selectedFiles = $state<File[]>([]);
  let isUploading = $state(false);

  const isDisabled = $derived(
    connectionState !== 'connected' || isStreaming || !sessionReady || isUploading,
  );

  const statusClass = $derived.by(() => {
    if (connectionState === 'connecting') return 'connecting';
    if (connectionState === 'connected') return 'connected';
    return 'disconnected';
  });

  const statusText = $derived.by(() => {
    if (isUploading) return 'Uploading…';
    switch (connectionState) {
      case 'connecting':
        return 'Connecting…';
      case 'connected':
        return isStreaming ? 'Streaming…' : sessionReady ? 'Ready' : 'Starting session…';
      case 'disconnected':
        return 'Disconnected';
      case 'error':
        return 'Connection error';
    }
  });

  const placeholder = $derived.by(() => {
    if (connectionState === 'connecting') return 'Connecting…';
    if (connectionState !== 'connected') return 'Not connected';
    if (!sessionReady) return 'Starting session…';
    if (isStreaming) return 'Waiting for response…';
    return 'Ask Copilot…';
  });

  function autoResize() {
    const el = textareaEl;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  }

  function handleFileSelect() {
    fileInputEl?.click();
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

    let attachments: Array<{ path: string; name: string; type: string }> | undefined;

    if (selectedFiles.length > 0) {
      isUploading = true;
      try {
        const uploaded = await uploadFiles(selectedFiles);
        attachments = uploaded.map((f) => ({ path: f.path, name: f.name, type: f.type }));
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

  // Virtual keyboard handling — update --vh CSS variable
  $effect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    function onResize() {
      const vh = (viewport?.height ?? window.innerHeight) * 0.01;
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
  <div class="input-container">
    {#if selectedFiles.length > 0}
      <div class="file-preview-row">
        {#each selectedFiles as file, i (file.name + i)}
          <div class="file-chip">
            <span class="file-chip-name">{file.name}</span>
            <span class="file-chip-size">{formatFileSize(file.size)}</span>
            <button class="file-chip-remove" onclick={() => removeFile(i)} aria-label="Remove {file.name}">×</button>
          </div>
        {/each}
      </div>
    {/if}

    <div class="prompt-line">
      <span class="term-prompt {statusClass}" data-mode={mode}>❯</span>
      <textarea
        bind:this={textareaEl}
        bind:value={inputValue}
        {placeholder}
        disabled={isDisabled}
        maxlength={MAX_LENGTH}
        rows={1}
        oninput={handleInput}
        onkeydown={handleKeydown}
      ></textarea>
    </div>
    <div class="status-bar">
      <div class="status-left">
        <span class="status-text">{statusText}</span>
      </div>
      <div class="status-right">
        {#if isStreaming}
          <button class="action-btn stop-btn" onclick={onAbort}>■ Stop</button>
        {/if}
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
        <button
          class="action-btn attach-btn"
          onclick={handleFileSelect}
          disabled={isDisabled || selectedFiles.length >= MAX_FILES}
          aria-label="Attach files"
        >📎</button>
        <span class="model-label">{currentModel}</span>
        <button class="sidebar-toggle-btn" onclick={onToggleSidebar}>☰</button>
      </div>
    </div>
  </div>
</div>

<style>
  .input-area {
    flex-shrink: 0;
    padding-bottom: var(--safe-bottom);
    border-top: 1px solid var(--border);
    background: var(--bg);
    position: relative;
  }

  .input-container {
    padding: var(--sp-3) 0 0;
  }

  .prompt-line {
    display: flex;
    align-items: flex-start;
    gap: 0;
  }

  .prompt-line .term-prompt {
    padding-top: 3px;
    line-height: 1.5;
    transition: color 0.2s ease;
  }

  .prompt-line .term-prompt.connected[data-mode='interactive'] {
    color: #e6edf3;
  }

  .prompt-line .term-prompt.connected[data-mode='plan'] {
    color: var(--blue);
  }

  .prompt-line .term-prompt.connected[data-mode='autopilot'] {
    color: var(--green);
  }

  .prompt-line .term-prompt.disconnected {
    color: var(--red);
  }

  .prompt-line .term-prompt.connecting {
    color: var(--yellow);
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.3;
    }
  }

  textarea {
    flex: 1;
    background: none;
    border: none;
    color: var(--fg);
    font-size: max(16px, var(--font-size));
    font-family: var(--font-mono);
    resize: none;
    outline: none;
    max-height: 100px;
    line-height: 1.5;
    padding: 2px 0;
    -webkit-appearance: none;
    appearance: none;
  }

  textarea::placeholder {
    color: var(--fg-dim);
    font-size: 0.85em;
  }

  textarea:disabled {
    opacity: 0.4;
  }

  textarea:disabled::placeholder {
    animation: inputLoading 1.5s ease-in-out infinite;
  }

  @keyframes inputLoading {
    0%,
    100% {
      opacity: 0.4;
    }
    50% {
      opacity: 0.8;
    }
  }

  .status-bar {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin-top: var(--sp-2);
    padding: var(--sp-2) 0;
    font-size: 0.82em;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .status-bar::-webkit-scrollbar {
    display: none;
  }

  .status-left {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    flex-shrink: 0;
    min-width: 0;
    color: var(--fg-dim);
  }

  .status-right {
    display: flex;
    align-items: center;
    gap: var(--sp-1);
    flex-shrink: 0;
    margin-left: auto;
  }

  .model-label {
    color: var(--fg-dim);
    font-family: var(--font-mono);
    font-size: 0.85em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 120px;
  }

  .sidebar-toggle-btn {
    background: none;
    border: 1px solid var(--border);
    color: var(--fg-muted);
    font-size: 1.1em;
    padding: 4px 10px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    line-height: 1;
    min-height: 36px;
    min-width: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .sidebar-toggle-btn:active {
    background: var(--border);
    color: var(--fg);
  }

  .action-btn {
    background: none;
    border: 1px solid var(--border);
    border-radius: 100px;
    color: var(--fg-dim);
    padding: var(--sp-1) var(--sp-2);
    font-family: var(--font-mono);
    font-size: 0.9em;
    cursor: pointer;
    white-space: nowrap;
    min-height: 26px;
    display: flex;
    align-items: center;
    gap: var(--sp-1);
  }

  .action-btn.stop-btn {
    color: var(--red);
    border-color: var(--red);
  }

  .action-btn.stop-btn:active {
    background: var(--red);
    color: var(--bg);
  }

  .file-input-hidden {
    position: absolute;
    width: 0;
    height: 0;
    overflow: hidden;
    opacity: 0;
    pointer-events: none;
  }

  .attach-btn {
    font-size: 1em;
    min-height: 26px;
    padding: var(--sp-1) var(--sp-2);
  }

  .attach-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .file-preview-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-1);
    padding: var(--sp-2) 0;
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
    background: var(--border);
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
</style>
