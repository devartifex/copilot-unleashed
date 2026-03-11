<script lang="ts">
  import type { SessionDetail } from '$lib/types/index.js';

  interface Props {
    detail: SessionDetail | null;
    onResume: () => void;
  }

  const { detail, onResume }: Props = $props();

  function formatDate(dateStr: string | undefined): string {
    if (!dateStr) return '';
    try {
      return new Date(dateStr).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  }

  function formatPath(cwd: string | undefined): string {
    if (!cwd) return '';
    const parts = cwd.split('/').filter(Boolean);
    return parts.length > 3 ? `…/${parts.slice(-3).join('/')}` : cwd;
  }
</script>

<div class="preview">
  {#if !detail}
    <div class="preview-loading">
      <div class="skeleton skeleton-block"></div>
      <div class="skeleton skeleton-line"></div>
      <div class="skeleton skeleton-line short"></div>
    </div>
  {:else}
    <div class="preview-body">
      {#if detail.summary}
        <div class="preview-summary">{detail.summary}</div>
      {/if}

      <div class="preview-meta">
        {#if detail.repository}
          <div class="meta-row">
            <span class="meta-label">Repository</span>
            <span class="meta-value">{detail.repository}</span>
          </div>
        {/if}
        {#if detail.branch}
          <div class="meta-row">
            <span class="meta-label">Branch</span>
            <span class="meta-value accent">{detail.branch}</span>
          </div>
        {/if}
        {#if detail.cwd}
          <div class="meta-row">
            <span class="meta-label">Directory</span>
            <span class="meta-value" title={detail.cwd}>{formatPath(detail.cwd)}</span>
          </div>
        {/if}
        {#if detail.createdAt || detail.updatedAt}
          <div class="meta-row">
            <span class="meta-label">Last active</span>
            <span class="meta-value">{formatDate(detail.updatedAt ?? detail.createdAt)}</span>
          </div>
        {/if}
      </div>

      {#if detail.checkpoints.length > 0}
        <div class="preview-section">
          <div class="section-header">Checkpoints ({detail.checkpoints.length})</div>
          <div class="checkpoint-list">
            {#each detail.checkpoints as cp (cp.number)}
              <div class="checkpoint-item">
                <span class="checkpoint-number">{cp.number}</span>
                <span class="checkpoint-title">{cp.title}</span>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      {#if detail.plan}
        <div class="preview-section">
          <div class="section-header">Plan</div>
          <div class="plan-preview">{detail.plan.length > 500 ? detail.plan.slice(0, 500) + '…' : detail.plan}</div>
        </div>
      {/if}
    </div>

    <div class="preview-footer">
      <button class="resume-btn" onclick={onResume}>
        Resume Session
      </button>
    </div>
  {/if}
</div>

<style>
  .preview {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .preview-loading {
    padding: var(--sp-4);
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
  }

  .skeleton-block {
    height: 40px;
    width: 100%;
  }

  .skeleton-line {
    height: 14px;
    width: 80%;
  }

  .skeleton-line.short {
    width: 50%;
  }

  .preview-body {
    flex: 1;
    overflow-y: auto;
    padding: var(--sp-3) var(--sp-4);
    scrollbar-width: thin;
    scrollbar-color: var(--border) transparent;
    min-height: 0;
  }
  .preview-body::-webkit-scrollbar { width: 4px; }
  .preview-body::-webkit-scrollbar-track { background: transparent; }
  .preview-body::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }

  .preview-summary {
    font-family: var(--font-mono);
    font-size: 0.9em;
    color: var(--fg);
    line-height: 1.5;
    margin-bottom: var(--sp-3);
    padding-bottom: var(--sp-3);
    border-bottom: 1px solid var(--border);
  }

  .preview-meta {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    margin-bottom: var(--sp-3);
  }

  .meta-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    font-family: var(--font-mono);
    font-size: 0.8em;
    gap: var(--sp-2);
  }

  .meta-label {
    color: var(--fg-dim);
    flex-shrink: 0;
  }

  .meta-value {
    color: var(--fg-muted);
    text-align: right;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .meta-value.accent {
    color: var(--accent);
  }

  .preview-section {
    margin-top: var(--sp-3);
    padding-top: var(--sp-3);
    border-top: 1px solid var(--border);
  }

  .section-header {
    font-family: var(--font-mono);
    font-size: 0.78em;
    font-weight: 600;
    color: var(--fg-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: var(--sp-2);
  }

  .checkpoint-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .checkpoint-item {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
    font-family: var(--font-mono);
    font-size: 0.82em;
  }

  .checkpoint-number {
    color: var(--fg-dim);
    flex-shrink: 0;
    min-width: 1.5em;
    text-align: right;
  }

  .checkpoint-title {
    color: var(--fg);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .plan-preview {
    font-family: var(--font-mono);
    font-size: 0.78em;
    color: var(--fg-muted);
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.5;
    max-height: 200px;
    overflow-y: auto;
    background: var(--bg-secondary, rgba(255, 255, 255, 0.03));
    border-radius: var(--radius-sm);
    padding: var(--sp-2) var(--sp-3);
  }

  .preview-footer {
    padding: var(--sp-3) var(--sp-4);
    padding-bottom: calc(var(--sp-3) + var(--safe-bottom));
    border-top: 1px solid var(--border);
    flex-shrink: 0;
    position: sticky;
    bottom: 0;
    background: var(--bg);
    z-index: 1;
  }

  .resume-btn {
    width: 100%;
    background: var(--accent);
    color: var(--bg);
    border: none;
    border-radius: var(--radius-sm);
    font-family: var(--font-mono);
    font-size: 0.85em;
    font-weight: 600;
    padding: var(--sp-2) var(--sp-3);
    min-height: 44px;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  .resume-btn:active {
    opacity: 0.85;
  }
</style>
