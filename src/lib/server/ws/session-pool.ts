import { WebSocket } from 'ws';
import type { CopilotClient } from '@github/copilot-sdk';
import { config } from '../config.js';

const MAX_BUFFER_SIZE = 500;
const TAB_ID_PATTERN = /^[a-z0-9_-]{1,64}$/i;

// Control message types that should be prioritized in the buffer (never evicted before data messages)
const CONTROL_MESSAGE_TYPES = new Set([
  'connected', 'session_created', 'session_resumed', 'session_reconnected',
  'turn_start', 'turn_end', 'done', 'error', 'warning',
  'session_shutdown', 'mode_changed', 'model_changed', 'title_changed',
  'permission_request', 'user_input_request',
  'tool_start', 'tool_end', 'session_idle', 'task_complete',
  'compaction_start', 'compaction_complete',
]);

export interface PoolEntry {
  client: CopilotClient;
  session: any;
  ws: WebSocket | null;
  messageBuffer: Record<string, unknown>[];
  ttlTimer: NodeJS.Timeout | null;
  userInputResolve: ((response: { answer: string; wasFreeform: boolean }) => void) | null;
  permissionResolve: ((decision: string) => void) | null;
  permissionPreferences: Map<string, 'allow' | 'deny'>;
  isProcessing: boolean;
  /** Monotonically increasing sequence number for message ordering */
  seq: number;
  /** Stored pending user input prompt for re-send on reconnect */
  pendingUserInputPrompt: Record<string, unknown> | null;
  /** Stored pending permission prompt for re-send on reconnect */
  pendingPermissionPrompt: Record<string, unknown> | null;
}

export const sessionPool = new Map<string, PoolEntry>();

export function createPoolEntry(client: CopilotClient, ws: WebSocket): PoolEntry {
  return {
    client,
    session: null,
    ws,
    messageBuffer: [],
    ttlTimer: null,
    userInputResolve: null,
    permissionResolve: null,
    permissionPreferences: new Map(),
    isProcessing: false,
    seq: 0,
    pendingUserInputPrompt: null,
    pendingPermissionPrompt: null,
  };
}

export async function destroyPoolEntry(entry: PoolEntry): Promise<void> {
  if (entry.ttlTimer) {
    clearTimeout(entry.ttlTimer);
    entry.ttlTimer = null;
  }
  if (entry.session) {
    try { await entry.session.disconnect(); } catch { /* ignore */ }
    entry.session = null;
  }
  entry.userInputResolve = null;
  entry.permissionResolve = null;
  entry.pendingUserInputPrompt = null;
  entry.pendingPermissionPrompt = null;
  entry.permissionPreferences.clear();
  try { await entry.client.stop(); } catch { /* ignore */ }
}

export function poolSend(entry: PoolEntry, data: Record<string, unknown>): void {
  const seqData = { ...data, seq: entry.seq++ };
  if (entry.ws && entry.ws.readyState === WebSocket.OPEN) {
    entry.ws.send(JSON.stringify(seqData));
  } else {
    if (entry.messageBuffer.length >= MAX_BUFFER_SIZE) {
      // Evict oldest data (non-control) message first to preserve important messages
      const dataIdx = entry.messageBuffer.findIndex(
        (m) => !CONTROL_MESSAGE_TYPES.has(m.type as string),
      );
      if (dataIdx >= 0) {
        entry.messageBuffer.splice(dataIdx, 1);
      } else {
        entry.messageBuffer.shift();
      }
    }
    entry.messageBuffer.push(seqData);
  }
}

export async function cleanupAllSessions(): Promise<void> {
  const promises: Promise<void>[] = [];
  for (const [key, entry] of sessionPool) {
    promises.push(destroyPoolEntry(entry));
    sessionPool.delete(key);
  }
  await Promise.allSettled(promises);
}

/** Validate that a tabId is a UUID-like string (max 36 chars, alphanumeric + hyphens) */
export function isValidTabId(tabId: string): boolean {
  return TAB_ID_PATTERN.test(tabId);
}

/** Destroy all pool entries for a specific user (e.g., on logout or token revocation) */
export async function cleanupUserSessions(username: string): Promise<void> {
  const prefix = `${username}:`;
  const promises: Promise<void>[] = [];
  for (const [key, entry] of sessionPool) {
    if (key.startsWith(prefix)) {
      promises.push(destroyPoolEntry(entry));
      sessionPool.delete(key);
    }
  }
  await Promise.allSettled(promises);
}

/** Count active pool entries for a specific user */
export function countUserSessions(username: string): number {
  const prefix = `${username}:`;
  let count = 0;
  for (const key of sessionPool.keys()) {
    if (key.startsWith(prefix)) count++;
  }
  return count;
}

/** Find and destroy the oldest pool entry for a user (the one with no active WS or earliest TTL) */
export async function evictOldestUserSession(username: string): Promise<void> {
  const prefix = `${username}:`;
  let oldestKey: string | null = null;
  let oldestHasWs = true;

  for (const [key, entry] of sessionPool) {
    if (!key.startsWith(prefix)) continue;
    // Prefer evicting entries without an active WebSocket
    const hasWs = entry.ws !== null && entry.ws.readyState === WebSocket.OPEN;
    if (oldestKey === null || (!hasWs && oldestHasWs)) {
      oldestKey = key;
      oldestHasWs = hasWs;
    }
  }

  if (oldestKey) {
    const entry = sessionPool.get(oldestKey);
    if (entry) {
      await destroyPoolEntry(entry);
      sessionPool.delete(oldestKey);
    }
  }
}
