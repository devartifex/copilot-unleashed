<script lang="ts">
  import { isImageFile, hasImageAttachments as checkImageAttachments } from '$lib/utils/image.js';
  import type { FileAttachment } from '$lib/types/index.js';

  const MAX_FILES = 5;
  const ACCEPTED_EXTENSIONS = [
    '.jpg', '.jpeg', '.png', '.gif', '.webp',
    '.ts', '.js', '.py', '.go', '.rs', '.java', '.c', '.cpp', '.h', '.cs', '.rb', '.php',
    '.md', '.txt', '.json', '.yaml', '.yml', '.xml', '.html', '.css', '.csv', '.sql',
  ];

  interface Props {
    selectedFiles: File[];
    supportsVision: boolean;
  }

  let { selectedFiles = $bindable(), supportsVision }: Props = $props();

  let fileInputEl: HTMLInputElement | undefined = $state();
  let cameraInputEl: HTMLInputElement | undefined = $state();

  const hasImageAttachments = $derived(
    checkImageAttachments(selectedFiles),
  );

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

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  }

  export async function uploadFiles(files: File[]): Promise<FileAttachment[]> {
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

  export function openFileSelect() {
    fileInputEl?.click();
  }

  export function openCamera() {
    cameraInputEl?.click();
  }

  export function openGallery() {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'image/*';
    input.onchange = (e) => handleFilesChanged(e);
    input.click();
  }
</script>

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

<style>
  .file-input-hidden {
    position: absolute;
    width: 0;
    height: 0;
    overflow: hidden;
    opacity: 0;
    pointer-events: none;
  }

  .file-preview-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-1);
    padding: var(--sp-2) var(--sp-1) 0;
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
