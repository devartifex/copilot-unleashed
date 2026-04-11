<script lang="ts">
  import { RefreshCw, FilePlus, FileText, ArrowLeft } from 'lucide-svelte';

  interface Props {
    files: string[];
    selectedFile: { path: string; content: string } | null;
    loading?: boolean;
    onListFiles: () => void;
    onReadFile: (path: string) => void;
    onCreateFile: (path: string, content: string) => void;
    onDeselectFile?: () => void;
  }

  const { files, selectedFile, loading = false, onListFiles, onReadFile, onCreateFile, onDeselectFile }: Props = $props();

  let showCreateForm = $state(false);
  let newFilePath = $state('');
  let newFileContent = $state('');

  const sortedFiles = $derived([...files].sort((a, b) => a.localeCompare(b)));

  const numberedLines = $derived.by(() => {
    if (!selectedFile) return [];
    return selectedFile.content.split('\n');
  });

  function handleCreate() {
    const trimmedPath = newFilePath.trim();
    if (!trimmedPath) return;
    onCreateFile(trimmedPath, newFileContent);
    newFilePath = '';
    newFileContent = '';
    showCreateForm = false;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey && showCreateForm) {
      const target = e.target as HTMLElement;
      if (target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        handleCreate();
      }
    }
  }
</script>

<div class="workspace-panel" onkeydown={handleKeydown}>
  <div class="workspace-toolbar">
    <button class="workspace-btn" onclick={onListFiles} aria-label="Refresh file list">
      <RefreshCw size={14} />
      Refresh
    </button>
    <button
      class="workspace-btn"
      onclick={() => { showCreateForm = !showCreateForm; }}
      aria-label={showCreateForm ? 'Cancel new file' : 'Create new file'}
    >
      <FilePlus size={14} />
      {showCreateForm ? 'Cancel' : 'New File'}
    </button>
  </div>

  {#if showCreateForm}
    <div class="create-form">
      <label class="create-label" for="new-file-path">File path</label>
      <input
        id="new-file-path"
        class="create-input"
        type="text"
        placeholder="e.g. notes/todo.md"
        bind:value={newFilePath}
      />
      <label class="create-label" for="new-file-content">Content</label>
      <textarea
        id="new-file-content"
        class="create-textarea"
        placeholder="File content…"
        rows="4"
        bind:value={newFileContent}
      ></textarea>
      <button
        class="workspace-btn create-submit"
        onclick={handleCreate}
        disabled={!newFilePath.trim()}
      >
        Create
      </button>
    </div>
  {/if}

  {#if loading}
    <div class="skeleton-list" role="status" aria-label="Loading files">
      <div class="skeleton skeleton-row"></div>
      <div class="skeleton skeleton-row"></div>
      <div class="skeleton skeleton-row"></div>
    </div>
  {:else if selectedFile}
    <div class="file-viewer">
      <div class="file-viewer-header">
        <button class="workspace-btn" onclick={() => onDeselectFile ? onDeselectFile() : onListFiles()} aria-label="Back to file list">
          <ArrowLeft size={14} />
          Back
        </button>
        <span class="file-viewer-path">{selectedFile.path}</span>
      </div>
      <pre class="file-content"><code>{#each numberedLines as line, i}<span class="line-number">{String(i + 1).padStart(4, ' ')}</span>  {line}
{/each}</code></pre>
    </div>
  {:else if files.length === 0}
    <p class="settings-hint empty-state">No workspace files. Start a session first.</p>
  {:else}
    <ul class="file-list" role="listbox" aria-label="Workspace files">
      {#each sortedFiles as file (file)}
        <li class="file-item" role="option" aria-selected="false">
          <button class="file-button" onclick={() => onReadFile(file)}>
            <FileText size={14} />
            <span class="file-name">{file}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .workspace-panel {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }
  .workspace-toolbar {
    display: flex;
    gap: var(--sp-2);
    flex-wrap: wrap;
  }
  .workspace-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    background: var(--bg-overlay);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--fg);
    font-size: 0.75em;
    padding: var(--sp-1) var(--sp-2);
    cursor: pointer;
    font-family: var(--font-mono);
  }
  .workspace-btn:hover {
    background: var(--border);
  }
  .workspace-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* Create form */
  .create-form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    padding: var(--sp-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-overlay);
  }
  .create-label {
    font-size: 0.72em;
    color: var(--fg-dim);
    font-family: var(--font-mono);
  }
  .create-input {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--fg);
    font-family: var(--font-mono);
    font-size: 0.78em;
    padding: var(--sp-1) var(--sp-2);
  }
  .create-input:focus {
    outline: 2px solid var(--green);
    outline-offset: -1px;
  }
  .create-textarea {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--fg);
    font-family: var(--font-mono);
    font-size: 0.78em;
    padding: var(--sp-1) var(--sp-2);
    resize: vertical;
    min-height: 60px;
  }
  .create-textarea:focus {
    outline: 2px solid var(--green);
    outline-offset: -1px;
  }
  .create-submit {
    align-self: flex-end;
  }

  /* Skeleton */
  .skeleton-list {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    padding: var(--sp-1) 0;
  }
  .skeleton-row {
    height: 28px;
    width: 100%;
  }

  /* Empty state */
  .settings-hint {
    font-family: var(--font-mono);
    font-size: 0.75em;
    color: var(--fg-dim);
    margin-bottom: var(--sp-2);
    line-height: 1.5;
  }
  .empty-state {
    text-align: center;
    padding: var(--sp-4) 0;
  }

  /* File list */
  .file-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
  }
  .file-item {
    border-bottom: 1px solid rgba(48, 54, 61, 0.5);
  }
  .file-item:last-child {
    border-bottom: none;
  }
  .file-button {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    width: 100%;
    background: none;
    border: none;
    color: var(--fg);
    font-family: var(--font-mono);
    font-size: 0.78em;
    padding: var(--sp-2) var(--sp-1);
    cursor: pointer;
    text-align: left;
  }
  .file-button:hover {
    background: var(--bg-overlay);
  }
  .file-button:focus-visible {
    outline: 2px solid var(--green);
    outline-offset: -2px;
  }
  .file-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* File viewer */
  .file-viewer {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }
  .file-viewer-header {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }
  .file-viewer-path {
    font-family: var(--font-mono);
    font-size: 0.75em;
    color: var(--fg-dim);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .file-content {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: var(--sp-2);
    margin: 0;
    overflow-x: auto;
    max-height: 320px;
    font-family: var(--font-mono);
    font-size: 0.72em;
    line-height: 1.5;
    color: var(--fg);
    tab-size: 2;
  }
  .file-content code {
    display: block;
    white-space: pre;
  }
  .line-number {
    color: var(--fg-dim);
    user-select: none;
    opacity: 0.5;
  }
</style>
