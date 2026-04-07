import { join } from 'node:path';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { config } from '../config.js';

interface SessionTurnRow {
  turn_index: number;
  user_message: string | null;
  assistant_response: string | null;
  timestamp: string;
}

interface SessionMetadataRow {
  summary: string | null;
  repository: string | null;
  branch: string | null;
}

export interface RestoredMessage {
  type: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface SqliteStatement {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
}

interface SqliteDatabase {
  prepare(sql: string): SqliteStatement;
  close(): void;
}

interface SqliteConstructor {
  new (path: string, options?: Record<string, unknown>): SqliteDatabase;
}

/** Resolve the path to the CLI's session-store.db */
export function getSessionStoreDbPath(): string {
  const base = config.copilotConfigDir || join(homedir(), '.copilot');
  return join(base, 'session-store.db');
}

/** Try to load DatabaseSync from node:sqlite. Returns null on older runtimes. */
function getDatabaseSync(): SqliteConstructor | null {
  try {
    // node:sqlite is experimental in Node 24 — dynamic require so the
    // module still loads on older runtimes (callers get null).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('node:sqlite') as { DatabaseSync: SqliteConstructor };
    return mod.DatabaseSync;
  } catch {
    return null;
  }
}

/**
 * Load conversation turns for a session from the CLI's session-store.db.
 * Returns messages in the same format the frontend expects for cold_resume:
 * `{ type: 'user'|'assistant', content: string, timestamp: number }`
 *
 * Uses node:sqlite (DatabaseSync) in read-only mode. Returns an empty array
 * if the database doesn't exist or the session has no turns.
 */
export function loadSessionTurns(sessionId: string): RestoredMessage[] {
  const dbPath = getSessionStoreDbPath();

  if (!existsSync(dbPath)) {
    return [];
  }

  const DatabaseSync = getDatabaseSync();
  if (!DatabaseSync) {
    console.warn('[SESSION-STORE-DB] node:sqlite not available — skipping turn loading');
    return [];
  }

  let db: SqliteDatabase | null = null;
  try {
    db = new DatabaseSync(dbPath, { open: true, readOnly: true });

    const rows = db
      .prepare(
        `SELECT turn_index, user_message, assistant_response, timestamp
         FROM turns
         WHERE session_id = ?
         ORDER BY turn_index ASC`,
      )
      .all(sessionId) as SessionTurnRow[];

    const messages: RestoredMessage[] = [];

    for (const row of rows) {
      const ts = row.timestamp ? new Date(row.timestamp).getTime() : Date.now();

      if (row.user_message) {
        messages.push({ type: 'user', content: row.user_message, timestamp: ts });
      }
      if (row.assistant_response) {
        messages.push({ type: 'assistant', content: row.assistant_response, timestamp: ts + 1 });
      }
    }

    return messages;
  } catch (err) {
    console.warn(
      '[SESSION-STORE-DB] Failed to read turns:',
      err instanceof Error ? err.message : err,
    );
    return [];
  } finally {
    try { db?.close(); } catch { /* ignore */ }
  }
}

/**
 * Load session metadata (summary, repo, branch) from session-store.db.
 * Returns null if the session isn't found.
 */
export function loadSessionMetadata(
  sessionId: string,
): { summary: string | null; repository: string | null; branch: string | null } | null {
  const dbPath = getSessionStoreDbPath();

  if (!existsSync(dbPath)) return null;

  const DatabaseSync = getDatabaseSync();
  if (!DatabaseSync) return null;

  let db: SqliteDatabase | null = null;
  try {
    db = new DatabaseSync(dbPath, { open: true, readOnly: true });

    const row = db
      .prepare('SELECT summary, repository, branch FROM sessions WHERE id = ?')
      .get(sessionId) as SessionMetadataRow | undefined;

    return row ?? null;
  } catch {
    return null;
  } finally {
    try { db?.close(); } catch { /* ignore */ }
  }
}
