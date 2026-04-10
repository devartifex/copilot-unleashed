import { getAvailableModels } from '../../copilot/session.js';
import { enrichSessionMetadata, getSessionDetail, listSessionsFromFilesystem, deleteSessionFromFilesystem, isValidSessionId } from '../../copilot/session-metadata.js';
import { poolSend } from '../session-pool.js';
import { debug } from '../../logger.js';
import type { MessageContext } from '../types.js';

export async function handleListSessions(msg: any, ctx: MessageContext): Promise<void> {
  const { connectionEntry } = ctx;

  try {
    await connectionEntry.client.start();
    const sessions = await connectionEntry.client.listSessions();
    const rawList = Array.isArray(sessions) ? sessions : [];
    debug('[LIST_SESSIONS] SDK returned', rawList.length, 'sessions');

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
    debug('[LIST_SESSIONS] Scanning filesystem…');
    const fsSessions = await listSessionsFromFilesystem();
    debug('[LIST_SESSIONS] Filesystem found', fsSessions.length, 'sessions');
    const sdkIds = new Set(sdkSessions.map((s) => s.id));
    const extraSessions = fsSessions.filter((s) => !sdkIds.has(s.id)).map((s) => ({ ...s, source: 'filesystem' as const }));
    const allSessions = [...sdkSessions, ...extraSessions];

    // Filter out sessions with no meaningful content — these are SDK-internal
    // empty sessions created at startup or after disconnects that were never used.
    // cwd is not a reliable signal: non-Docker runs set a real cwd on phantom sessions.
    const list = allSessions.filter((s) =>
      s.title || s.checkpointCount > 0 || s.hasPlan,
    );
    debug('[LIST_SESSIONS] Sending', list.length, 'total (SDK:', sdkSessions.length, '+ FS extra:', extraSessions.length, ', filtered out:', allSessions.length - list.length, ')');

    poolSend(connectionEntry, { type: 'sessions', sessions: list });
  } catch (err: any) {
    console.error('[LIST_SESSIONS] SDK error:', err.message);
    // SDK failed — fall back to filesystem-only listing
    try {
      const fsSessions = await listSessionsFromFilesystem();
      debug('[LIST_SESSIONS] Fallback: filesystem found', fsSessions.length, 'sessions');
      poolSend(connectionEntry, { type: 'sessions', sessions: fsSessions.map((s) => ({ ...s, source: 'filesystem' as const })) });
    } catch (fsErr: any) {
      console.error('[LIST_SESSIONS] Filesystem fallback also failed:', fsErr.message);
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
    debug('[SESSION_DETAIL] Result:', detail ? `found (id=${detail.id})` : 'null');
    if (!detail) {
      poolSend(connectionEntry, { type: 'error', message: 'Session not found' });
      return;
    }
    poolSend(connectionEntry, { type: 'session_detail', detail });
  } catch (err: any) {
    console.error('[SESSION_DETAIL] Error:', err.message);
    poolSend(connectionEntry, { type: 'error', message: `Failed to get session detail: ${err.message}` });
  }
}

export async function handleGetSessionHistory(msg: any, ctx: MessageContext): Promise<void> {
  const { connectionEntry } = ctx;

  const session = connectionEntry.session;
  if (!session) {
    poolSend(connectionEntry, { type: 'error', message: 'No active session' });
    return;
  }

  try {
    const events = await session.getMessages();
    const eventList = Array.isArray(events) ? events : [];
    debug('[SESSION_HISTORY] Got', eventList.length, 'events');

    const messages: Array<{ id: string; role: 'user' | 'assistant'; content: string; timestamp: number }> = eventList
      .filter((e: any) => e.type === 'assistant.message' || e.type === 'user.message')
      .map((e: any, i: number) => ({
        id: `hist-${i}-${Date.now()}`,
        role: e.type === 'user.message' ? 'user' as const : 'assistant' as const,
        content: e.data?.content ?? '',
        timestamp: e.timestamp ? new Date(e.timestamp).getTime() : Date.now(),
      }));

    poolSend(connectionEntry, { type: 'session_history', messages });
  } catch (err: any) {
    console.error('[SESSION_HISTORY] Error:', err.message);
    poolSend(connectionEntry, { type: 'error', message: `Failed to get session history: ${err.message}` });
  }
}

export async function handleSessionLog(msg: any, ctx: MessageContext): Promise<void> {
  const { connectionEntry } = ctx;

  const session = connectionEntry.session;
  if (!session) {
    poolSend(connectionEntry, { type: 'error', message: 'No active session' });
    return;
  }

  const logMessage = typeof msg.message === 'string' ? msg.message.trim() : '';
  if (!logMessage) {
    poolSend(connectionEntry, { type: 'error', message: 'Log message is required' });
    return;
  }

  try {
    const level = msg.level === 'warning' || msg.level === 'error' ? msg.level : 'info';
    await session.log(logMessage, { level });
    debug('[SESSION_LOG] Logged:', level, logMessage.slice(0, 80));
  } catch (err: any) {
    console.error('[SESSION_LOG] Error:', err.message);
    poolSend(connectionEntry, { type: 'error', message: `Failed to log message: ${err.message}` });
  }
}

export async function handleListModels(msg: any, ctx: MessageContext): Promise<void> {
  const { connectionEntry } = ctx;

  const models = await getAvailableModels(connectionEntry.client);
  const modelArray = Array.isArray(models) ? models : [];
  poolSend(connectionEntry, { type: 'models', models: modelArray });
}
