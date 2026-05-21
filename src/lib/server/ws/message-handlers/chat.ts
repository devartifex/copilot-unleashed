import { poolSend, sessionPool } from '../session-pool.js';
import { MAX_MESSAGE_LENGTH } from '../constants.js';
import { mapAttachmentsToSdk } from '../attachments.js';
import { resolveFileMentions } from '../file-mentions.js';
import { chatStateStore } from '../../chat-state-singleton.js';
import type { MessageContext } from '../types.js';

function rawTabId(ctx: MessageContext): string {
  return ctx.poolKey.split(':').slice(1).join(':');
}

export async function handleChat(msg: any, ctx: MessageContext): Promise<void> {
  const { connectionEntry } = ctx;

  const content = typeof msg.content === 'string' ? msg.content : '';
  if (!content.trim() || content.length > MAX_MESSAGE_LENGTH) {
    poolSend(connectionEntry, { type: 'error', message: `Message must be 1-${MAX_MESSAGE_LENGTH} characters` });
    return;
  }

  if (!connectionEntry.session) {
    poolSend(connectionEntry, { type: 'error', message: 'No active session. Send new_session first.' });
    return;
  }

  const uploadAttachments = mapAttachmentsToSdk(msg.attachments) ?? [];

  // Resolve @file mentions from the message content
  const { prompt, fileAttachments: mentionAttachments } = await resolveFileMentions(content);
  const allAttachments = [...uploadAttachments, ...mentionAttachments];

  const currentSdkSessionId = connectionEntry.sdkSessionId;
  const hasActivePeer = [...sessionPool.entries()].some(([poolKey, peerEntry]) => {
    if (!poolKey.startsWith(`${ctx.userLogin}:`)) return false;
    if (peerEntry === connectionEntry) return false;
    if (!peerEntry.isProcessing) return false;
    if (!currentSdkSessionId || !peerEntry.sdkSessionId) return false;
    return peerEntry.sdkSessionId === currentSdkSessionId;
  });
  if (hasActivePeer) {
    poolSend(connectionEntry, {
      type: 'session_taken',
      message: 'Another device is currently generating a response for this conversation.',
    });
  }

  connectionEntry.isProcessing = true;

  // Persist user message before sending to SDK (fire-and-forget)
  chatStateStore.appendMessage(ctx.userLogin, rawTabId(ctx), {
    type: 'user',
    content,
    timestamp: Date.now(),
    ...(allAttachments.length ? { attachmentCount: allAttachments.length } : {}),
  }).catch(() => {});
  chatStateStore.setPrimarySession(ctx.userLogin, {
    tabId: rawTabId(ctx),
    sdkSessionId: connectionEntry.sdkSessionId,
    model: connectionEntry.model ?? 'gpt-4.1',
    mode: connectionEntry.mode ?? 'interactive',
    updatedAt: Date.now(),
  }).catch(() => {});

  const sendMode = msg.mode === 'immediate' || msg.mode === 'enqueue' ? msg.mode : undefined;
  await connectionEntry.session.send({
    prompt,
    ...(allAttachments.length ? { attachments: allAttachments } : {}),
    ...(sendMode ? { mode: sendMode } : {}),
  });
}
