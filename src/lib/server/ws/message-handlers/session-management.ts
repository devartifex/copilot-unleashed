import { getAvailableModels } from '../../copilot/session.js';
import { enrichSessionMetadata, getSessionDetail, listSessionsFromFilesystem, deleteSessionFromFilesystem, isValidSessionId } from '../../copilot/session-metadata.js';
import { poolSend } from '../session-pool.js';
import type { MessageContext } from '../types.js';

export async function handleListSessions(msg: any, ctx: MessageContext): Promise<void> {
  const { connectionEntry } = ctx;

  try {
    // start() is idempotent — no-op if the client is already running
    await connectionEntry.client.start();
    const sessions = await connectionEntry.client.listSessions();
    const rawList = Array.isArray(sessions) ? sessions : [];

    // Enrich each session with filesystem metadata in parallel
    const sdkSessions = await Promise.all(
      rawList.map(async (s: any) => {
        const id = s.sessionId ?? s.id;
        const enriched = await enrichSessionMetadata(id, s.context, s.isRemote);
        // Strip unhelpful cwd values (container home dir, root, etc.)
        const cwd = enriched.cwd && enriched.cwd !== '/home/node' && enriched.cwd !== '/' ? enriched.cwd : undefined;
        return {
          id,
          title: s.summary ?? s.title,
          updatedAt: s.modifiedTime ?? s.updatedAt,
          model: s.model,
          source: 'sdk' as const,
          ...enriched,
          cwd,
        };
      }),
    );

    // Merge with filesystem sessions the SDK may not know about
    // (e.g. bundled sessions copied into a fresh container)
    const fsSessions = await listSessionsFromFilesystem();
    const sdkIds = new Set(sdkSessions.map((s) => s.id));
    const extraSessions = fsSessions.filter((s) => !sdkIds.has(s.id)).map((s) => ({ ...s, source: 'filesystem' as const }));
    const allSessions = [...sdkSessions, ...extraSessions];

    // Filter out sessions with no meaningful content — these are SDK-internal
    // empty sessions created at startup or after disconnects that were never used.
    const list = allSessions.filter((s) =>
      s.title || s.checkpointCount > 0 || s.hasPlan || (s.cwd && s.cwd !== '/home/node'),
    );
    console.log('[LIST-SESSIONS] Sending', list.length, 'sessions (SDK:', sdkSessions.length, '+ FS-only:', extraSessions.length, ')');
    poolSend(connectionEntry, { type: 'sessions', sessions: list });
  } catch (err: any) {
    console.error('[LIST-SESSIONS] SDK error:', err.message);
    // SDK failed — fall back to filesystem-only listing
    try {
      const fsSessions = await listSessionsFromFilesystem();
      poolSend(connectionEntry, { type: 'sessions', sessions: fsSessions.map((s) => ({ ...s, source: 'filesystem' as const })) });
    } catch (fsErr: any) {
      console.error('[LIST-SESSIONS] Filesystem fallback also failed:', fsErr.message);
      poolSend(connectionEntry, { type: 'sessions', sessions: [] });
    }
  }
}

export async function handleDeleteSession(msg: any, ctx: MessageContext): Promise<void> {
  const { connectionEntry } = ctx;

  const deleteId = typeof msg.sessionId === 'string' ? msg.sessionId.trim() : '';
  if (!deleteId) {
    poolSend(connectionEntry, { type: 'error', message: 'Session ID is required' });
    return;
  }
  if (!isValidSessionId(deleteId)) {
    poolSend(connectionEntry, { type: 'error', message: 'Invalid session ID format' });
    return;
  }

  // Prevent deleting the active session
  if (connectionEntry.session?.sessionId === deleteId) {
    poolSend(connectionEntry, { type: 'error', message: 'Cannot delete the active session' });
    return;
  }

  try {
    await connectionEntry.client.deleteSession(deleteId);
    poolSend(connectionEntry, { type: 'session_deleted', sessionId: deleteId });
  } catch (err: any) {
    // SDK doesn't know this session — try filesystem deletion
    // (e.g. bundled or filesystem-only sessions)
    try {
      const deleted = await deleteSessionFromFilesystem(deleteId);
      if (deleted) {
        poolSend(connectionEntry, { type: 'session_deleted', sessionId: deleteId });
      } else {
        poolSend(connectionEntry, { type: 'error', message: `Session not found: ${deleteId}` });
      }
    } catch (fsErr: any) {
      console.error('Delete session error:', err.message, '| Filesystem fallback:', fsErr.message);
      poolSend(connectionEntry, { type: 'error', message: `Failed to delete session: ${err.message}` });
    }
  }
}

export async function handleGetSessionDetail(msg: any, ctx: MessageContext): Promise<void> {
  const { connectionEntry } = ctx;

  const detailId = typeof msg.sessionId === 'string' ? msg.sessionId.trim() : '';
  if (!detailId) {
    poolSend(connectionEntry, { type: 'error', message: 'Session ID is required' });
    return;
  }
  if (!isValidSessionId(detailId)) {
    poolSend(connectionEntry, { type: 'error', message: 'Invalid session ID format' });
    return;
  }

  try {
    const detail = await getSessionDetail(detailId);
    if (!detail) {
      poolSend(connectionEntry, { type: 'error', message: 'Session not found' });
      return;
    }
    poolSend(connectionEntry, { type: 'session_detail', detail });
  } catch (err: any) {
    console.error('[GET-SESSION-DETAIL] Error:', err.message);
    poolSend(connectionEntry, { type: 'error', message: `Failed to get session detail: ${err.message}` });
  }
}

export async function handleListModels(msg: any, ctx: MessageContext): Promise<void> {
  const { connectionEntry } = ctx;

  const models = await getAvailableModels(connectionEntry.client);
  const modelArray = Array.isArray(models) ? models : [];
  poolSend(connectionEntry, { type: 'models', models: modelArray });
}
