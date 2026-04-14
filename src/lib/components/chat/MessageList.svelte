<script lang="ts">
  import { tick, untrack } from 'svelte';
  import type { Snippet } from 'svelte';
  import type { ChatStore } from '$lib/stores/chat.svelte.js';
  import { renderMarkdown, highlightCodeBlocks, addCopyButtons } from '$lib/utils/markdown.js';
  import { Sparkles, ArrowDown } from 'lucide-svelte';
  import Spinner from '$lib/components/shared/Spinner.svelte';
  import ChatMessage from '$lib/components/chat/ChatMessage.svelte';
  import ReasoningBlock from '$lib/components/chat/ReasoningBlock.svelte';

  interface Props {
    chatStore: ChatStore;
    username?: string;
    onSendQueued?: (id: string) => void;
    onCancelQueued?: (id: string) => void;
    children?: Snippet;
  }

  const { chatStore, username, onSendQueued, onCancelQueued, children }: Props = $props();

  let messagesEl: HTMLDivElement | undefined = $state();
  let streamContentEl: HTMLDivElement | undefined = $state();
  let stickToBottom = $state(true);

  const streamHtml = $derived(
    chatStore.currentStreamContent
      ? renderMarkdown(chatStore.currentStreamContent)
      : '',
  );

  const hasReasoningContent = $derived(chatStore.currentReasoningContent.length > 0);
  const showWaiting = $derived(
    chatStore.isWaiting &&
    !chatStore.currentStreamContent &&
    !chatStore.currentReasoningContent,
  );

  const showScrollButton = $derived(!stickToBottom);

  function isNearBottom(): boolean {
    const el = messagesEl;
    if (!el) return true;
    const threshold = 100;
    return el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  }

  function scrollToBottom() {
    const el = messagesEl;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'instant' });
  }

  function handleScroll() {
    stickToBottom = isNearBottom();
  }

  function handleScrollToBottomClick() {
    stickToBottom = true;
    scrollToBottom();
  }

  // Re-engage auto-scroll when user sends a new message
  $effect(() => {
    if (chatStore.isWaiting) {
      stickToBottom = true;
    }
  });

  // Auto-scroll when new messages arrive or stream content updates
  $effect(() => {
    chatStore.messages.length;
    chatStore.currentStreamContent;

    if (untrack(() => stickToBottom)) {
      tick().then(() => scrollToBottom());
    }
  });

  // Highlight code blocks in streaming content
  $effect(() => {
    if (!streamContentEl || !chatStore.currentStreamContent) return;
    streamHtml;
    highlightCodeBlocks(streamContentEl);
    addCopyButtons(streamContentEl);
  });
</script>

<div class="messages-container">
  <div class="messages" bind:this={messagesEl} onscroll={handleScroll}>
    {@render children?.()}

    {#each chatStore.messages as msg (msg.id)}
      <ChatMessage message={msg} {username} {onSendQueued} {onCancelQueued} />
    {/each}

    {#if hasReasoningContent}
      <ReasoningBlock
        content={chatStore.currentReasoningContent}
        isStreaming={chatStore.isReasoningStreaming}
      />
    {/if}

    {#if showWaiting}
      <div class="waiting-indicator">
        <Spinner color="var(--yellow)" />
        <span class="waiting-label">Thinking</span>
      </div>
    {/if}

    {#if chatStore.currentStreamContent}
      <div class="message assistant streaming">
        <span class="assistant-marker"><Sparkles size={14} /> Copilot</span>
        <div class="content" bind:this={streamContentEl}>
          {@html streamHtml}
          <span class="typing-indicator"></span>
        </div>
      </div>
    {/if}
  </div>

  {#if showScrollButton}
    <button
      class="scroll-to-bottom"
      onclick={handleScrollToBottomClick}
      aria-label="Scroll to bottom"
    >
      <ArrowDown size={18} />
    </button>
  {/if}
</div>

<style>
  .messages-container {
    position: relative;
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .messages {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    padding: var(--sp-2) 0;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
    scroll-padding-bottom: 80px;
  }

  /* ── streaming assistant message ───────────────────────────────────────── */
  .message.assistant {
    padding: var(--sp-2) var(--sp-3);
    align-self: flex-start;
    max-width: 92%;
    border-left: 3px solid var(--mode-border, var(--border-accent));
    border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
    background: rgba(22, 27, 34, 0.6);
    animation: msg-in 0.3s cubic-bezier(0.22, 1, 0.36, 1);
    transition: border-color 0.3s ease;
  }

  .assistant-marker {
    color: var(--mode-color, var(--purple));
    font-weight: 700;
    font-size: 0.85em;
    display: block;
    margin-bottom: var(--sp-1);
    opacity: 0.7;
    transition: color 0.3s ease;
  }

  .content {
    color: var(--fg);
    font-size: 0.95em;
    line-height: 1.65;
  }

  /* Markdown styles for streaming content */
  .content :global(p) {
    margin: 0 0 var(--sp-2);
  }

  .content :global(p:last-child) {
    margin-bottom: 0;
  }

  .content :global(pre) {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: var(--sp-3);
    overflow-x: auto;
    margin: var(--sp-2) 0;
    position: relative;
    font-size: 0.9em;
    line-height: 1.5;
  }

  .content :global(code) {
    font-family: var(--font-mono);
    font-size: 0.9em;
  }

  .content :global(:not(pre) > code) {
    background: var(--bg-overlay);
    padding: 1px 5px;
    border-radius: 3px;
    border: 1px solid var(--border);
    font-size: 0.88em;
  }

  .content :global(.copy-btn) {
    position: absolute;
    top: var(--sp-2);
    right: var(--sp-2);
    background: var(--bg-overlay);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--fg-dim);
    padding: var(--sp-1) var(--sp-2);
    font-size: 0.75em;
    font-family: var(--font-mono);
    cursor: pointer;
    min-height: 28px;
    min-width: 44px;
    text-align: center;
  }

  @media (hover: hover) {
    .content :global(.copy-btn) {
      opacity: 0;
    }

    .content :global(pre:hover .copy-btn) {
      opacity: 1;
    }
  }

  /* ── typing cursor ────────────────────────────────────────────────────── */
  .typing-indicator {
    display: inline;
    color: var(--fg-dim);
  }

  .typing-indicator::after {
    content: '▋';
    animation: blink-cursor 1s step-end infinite;
  }

  @keyframes msg-in {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @keyframes blink-cursor {
    0%, 100% { opacity: 1; }
    50% { opacity: 0; }
  }

  /* ── waiting indicator (before first token/tool) ─────────────────────── */
  .waiting-indicator {
    padding: var(--sp-2) var(--sp-3);
    padding-left: calc(var(--sp-3) + 3px);
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    animation: msg-in 0.3s cubic-bezier(0.22, 1, 0.36, 1);
  }

  .waiting-label {
    color: var(--fg-muted);
    font-size: 0.82em;
  }

  /* ── scroll-to-bottom button ─────────────────────────────────────────── */
  .scroll-to-bottom {
    position: absolute;
    bottom: 16px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--bg-overlay);
    border: 1px solid var(--border);
    border-radius: 50%;
    color: var(--fg-dim);
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    opacity: 0.85;
    transition: opacity 0.2s ease, background 0.2s ease;
    z-index: 10;
    backdrop-filter: blur(8px);
    animation: fade-in-up 0.2s ease;
  }

  .scroll-to-bottom:hover {
    opacity: 1;
    background: var(--bg-surface, var(--bg-overlay));
  }

  @keyframes fade-in-up {
    from { opacity: 0; transform: translateX(-50%) translateY(8px); }
    to { opacity: 0.85; transform: translateX(-50%) translateY(0); }
  }
</style>
