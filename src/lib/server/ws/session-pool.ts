import { WebSocket } from 'ws';
import type { CopilotClient } from '@github/copilot-sdk';
import { config } from '../config.js';

const MAX_BUFFER_SIZE = 500;
const TAB_ID_PATTERN = /^[a-z0-9_-]{1,64}$/i;

// Control message types that should be prioritized in the buffer (never evicted before data messages)
const CONTROL_MESSAGE_TYPES = new Set([
  'connected', 'cold_resume', 'session_created', 'session_resumed', 'session_reconnected',
  'turn_start', 'turn_end', 'done', 'error', 'warning',
  'session_shutdown', 'mode_changed', 'model_changed', 'title_changed',
  'permission_request', 'user_input_request',
  'tool_start', 'tool_end', 'session_idle', 'task_complete',
  'compaction_start', 'compaction_complete',
]);

/** Threshold for considering a client connection stale (no ping received). */
export const CLIENT_STALE_MS = 35_000;

export interface PoolEntry {
  client: CopilotClient;
  session: any;
  /** SDK session ID for cold resume — stored when session is created */
  sdkSessionId: string | null;
  /** Current model for session resume */
  model: string | null;
  /** Current session mode */
  mode: string | null;
  ws: WebSocket | null;
  messageBuffer: Record<string, unknown>[];
  ttlTimer: NodeJS.Timeout | null;
  userInputResolve: ((response: { answer: string; wasFreeform: boolean }) => void) | null;
  /** Map of pending permission resolvers keyed by requestId — supports concurrent permission requests */
  permissionResolves: Map<string, (decision: string) => void>;
  permissionPreferences: Map<string, 'allow' | 'deny'>;
  isProcessing: boolean;
  /** Monotonically increasing sequence number for message ordering */
  seq: number;
  /** Stored pending user input prompt for re-send on reconnect */
  pendingUserInputPrompt: Record<string, unknown> | null;
  /** Map of pending permission prompts keyed by requestId — re-sent on reconnect */
  pendingPermissionPrompts: Map<string, Record<string, unknown>>;
  /** Timestamp of the last client ping — used to detect backgrounded/suspended apps */
  lastPingAt: number;
}

export const sessionPool = new Map<string, PoolEntry>();

export function createPoolEntry(client: CopilotClient, ws: WebSocket): PoolEntry {
  return {
    client,
    session: null,
    sdkSessionId: null,
    model: null,
    mode: null,
    ws,
    messageBuffer: [],
    ttlTimer: null,
    userInputResolve: null,
    permissionResolves: new Map(),
    permissionPreferences: new Map(),
    isProcessing: false,
    seq: 0,
    pendingUserInputPrompt: null,
    pendingPermissionPrompts: new Map(),
    lastPingAt: Date.now(),
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
  entry.permissionResolves.clear();
  entry.pendingUserInputPrompt = null;
  entry.pendingPermissionPrompts.clear();
  entry.permissionPreferences.clear();
  try { await entry.client.stop(); } catch { /* ignore */ }
}

/** True when the client WS is closed or hasn't sent a ping recently (e.g. iOS backgrounded). */
export function isClientUnreachable(entry: PoolEntry): boolean {
  if (!entry.ws || entry.ws.readyState !== WebSocket.OPEN) return true;
  return Date.now() - entry.lastPingAt > CLIENT_STALE_MS;
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

/** Send a message to all pool entries with an active WebSocket */
export function broadcastToAll(data: Record<string, unknown>): void {
  for (const entry of sessionPool.values()) {
    if (entry.ws && entry.ws.readyState === WebSocket.OPEN) {
      entry.ws.send(JSON.stringify(data));
    }
  }
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
      // Notify the client before destroying so it can show a meaningful message
      if (entry.ws && entry.ws.readyState === WebSocket.OPEN) {
        try {
          entry.ws.send(JSON.stringify({ type: 'error', message: 'Session evicted — too many active sessions. Please refresh to reconnect.' }));
          entry.ws.close(4003, 'Session evicted');
        } catch { /* ignore */ }
      }
      await destroyPoolEntry(entry);
      sessionPool.delete(oldestKey);
    }
  }
}
