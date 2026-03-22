import { WebSocketServer, WebSocket } from 'ws';
import { Server, IncomingMessage } from 'http';
import { createCopilotClient } from '../copilot/client.js';
import { config } from '../config.js';
import { logSecurity } from '../security-log.js';
import { validateGitHubToken } from '../auth/github.js';
import { checkAuth } from '../auth/guard.js';
import { clearAuth } from '../auth/session-utils.js';
import {
  sessionPool, createPoolEntry, destroyPoolEntry, poolSend,
  isValidTabId, countUserSessions, evictOldestUserSession,
} from './session-pool.js';
import { VALID_MESSAGE_TYPES, HEARTBEAT_INTERVAL, RATE_LIMITED_TYPES, WS_RATE_LIMIT_MAX, WS_RATE_LIMIT_WINDOW_MS } from './constants.js';
import { messageHandlers } from './message-handlers/index.js';
import { chatStateStore } from '../chat-state-singleton.js';
import type { SessionMiddleware, MessageContext } from './types.js';

export { cleanupAllSessions, cleanupUserSessions } from './session-pool.js';

export function setupWebSocket(
  server: Server,
  sessionMiddleware: SessionMiddleware
): void {
  const wss = new WebSocketServer({ server, path: '/ws' });

  // Heartbeat — detect dead connections
  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws: WebSocket & { isAlive?: boolean }) => {
      if (ws.isAlive === false) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, HEARTBEAT_INTERVAL);

  wss.on('close', () => clearInterval(heartbeat));

  wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
    console.log('[WS-SERVER] New connection attempt from', req.socket.remoteAddress);
    (ws as any).isAlive = true;
    ws.on('pong', () => { (ws as any).isAlive = true; });

    // Validate WebSocket origin
    const origin = req.headers.origin;
    if (origin && !config.isDev) {
      const baseOrigin = new URL(config.baseUrl).origin;
      if (origin !== baseOrigin) {
        logSecurity('warn', 'ws_forbidden_origin', { origin, expected: baseOrigin });
        ws.close(1008, 'Forbidden origin');
        return;
      }
    }

    // Extract Express session from the upgrade request
    await new Promise<void>((resolve) => {
      sessionMiddleware(req, {} as any, resolve);
    });

    const session = (req as any).session;
    console.log('[WS-SERVER] Session extracted:', !!session, 'token:', !!session?.githubToken, 'user:', session?.githubUser?.login);
    const auth = checkAuth(session);
    console.log('[WS-SERVER] Auth check result:', auth.authenticated, auth.error || 'ok');
    if (!auth.authenticated) {
      logSecurity('warn', 'ws_unauthorized', {
        ip: req.socket.remoteAddress,
        reason: auth.error,
      });
      ws.close(4001, auth.error ?? 'Unauthorized');
      return;
    }

    // Validate token is still valid with GitHub (catches revoked tokens)
    // Skip for tokens authenticated within the last 30 seconds (just validated by poll endpoint)
    const authAge = session.githubAuthTime ? Date.now() - session.githubAuthTime : Infinity;
    if (authAge > 30_000) {
      const validation = await validateGitHubToken(session.githubToken);
      if (!validation.valid && validation.reason === 'invalid_token') {
        logSecurity('warn', 'ws_token_revoked', { user: session.githubUser?.login });
        await clearAuth(session);
        ws.close(4001, 'Token revoked');
        return;
      }
      // Transient API errors are not treated as revocation — allow connection
    }

    const githubToken: string = session.githubToken;
    const userLogin: string = session.githubUser?.login || 'unknown';
    const reqUrl = new URL(req.url || '/', `http://${req.headers.host}`);
    const rawTabId = reqUrl.searchParams.get('tabId') || 'default';
    const tabId = isValidTabId(rawTabId) ? rawTabId : 'default';
    const lastSeq = parseInt(reqUrl.searchParams.get('lastSeq') || '-1', 10);
    const poolKey = `${userLogin}:${tabId}`;
    console.log('[WS-SERVER] Authenticated user:', userLogin, 'tab:', tabId, 'lastSeq:', lastSeq, 'checking pool...');
    let entry = sessionPool.get(poolKey);

    if (entry) {
      console.log('[WS-SERVER] Existing pool entry found for', poolKey);
      // Reattach to existing pool entry
      if (entry.ws && entry.ws !== ws && entry.ws.readyState === WebSocket.OPEN) {
        entry.ws.close(4002, 'Replaced by new connection');
      }
      if (entry.ttlTimer) {
        clearTimeout(entry.ttlTimer);
        entry.ttlTimer = null;
      }
      entry.ws = ws;

      // Replay only messages the client hasn't seen (based on sequence numbers).
      // Mark each replayed message so the client can suppress duplicate notifications
      // (the server already sent a push notification while the client was unreachable).
      const buffer = entry.messageBuffer.splice(0);
      for (const msg of buffer) {
        const msgSeq = typeof msg.seq === 'number' ? msg.seq : -1;
        if (msgSeq > lastSeq && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ ...msg, replayed: true }));
        }
      }

      console.log('[WS-SERVER] Sending session_reconnected to', poolKey, 'hasSession:', !!entry.session);
      poolSend(entry, {
        type: 'session_reconnected',
        user: userLogin,
        hasSession: !!entry.session,
        isProcessing: entry.isProcessing,
      });

      // Restore chat history from persisted state so the UI is populated
      try {
        const persistedState = await chatStateStore.load(userLogin, tabId);
        if (persistedState && persistedState.messages.length > 0) {
          poolSend(entry, {
            type: 'cold_resume',
            messages: persistedState.messages,
            model: persistedState.model,
            mode: persistedState.mode,
            sdkSessionId: persistedState.sdkSessionId,
          });
        }
      } catch (err) {
        console.error('[WS-SERVER] Warm reconnect history load failed:', err);
      }

      // Re-send pending prompts so the user can respond on the new connection
      if (entry.pendingUserInputPrompt && entry.userInputResolve) {
        poolSend(entry, entry.pendingUserInputPrompt);
      }
      for (const prompt of entry.pendingPermissionPrompts.values()) {
        poolSend(entry, prompt);
      }
    } else {
      // Create new pool entry — enforce per-user session cap
      if (countUserSessions(userLogin) >= config.maxSessionsPerUser) {
        console.log('[WS-SERVER] Session cap reached for', userLogin, '— evicting oldest');
        await evictOldestUserSession(userLogin);
      }
      console.log('[WS-SERVER] Creating new pool entry for', poolKey);
      const client = createCopilotClient(githubToken, config.copilotConfigDir);
      entry = createPoolEntry(client, ws);
      sessionPool.set(poolKey, entry);

      // Load persisted state BEFORE sending connected so the client gets
      // sdkSessionId in a single message and can decide immediately
      // whether to resume or create a new session (no timer/delay needed).
      let persistedState: Awaited<ReturnType<typeof chatStateStore.load>> = null;
      try {
        persistedState = await chatStateStore.load(userLogin, tabId);
      } catch (err) {
        console.error('[WS-SERVER] Cold resume load failed:', err);
      }

      const hasPersistedState = !!(persistedState && persistedState.messages.length > 0);
      console.log('[WS-SERVER] Sending connected to', poolKey, 'persisted:', hasPersistedState);
      poolSend(entry, {
        type: 'connected',
        user: userLogin,
        sdkSessionId: hasPersistedState ? persistedState!.sdkSessionId : null,
        hasPersistedState,
      });

      // Send full chat history for UI restoration
      if (hasPersistedState) {
        poolSend(entry, {
          type: 'cold_resume',
          messages: persistedState!.messages,
          model: persistedState!.model,
          mode: persistedState!.mode,
          sdkSessionId: persistedState!.sdkSessionId,
        });
      }
    }

    // Capture entry reference for this connection's handlers
    const connectionEntry = entry;

    ws.on('close', (code: number, reason: Buffer) => {
      console.log('[WS-SERVER] Client disconnected:', poolKey, 'code:', code, 'reason:', reason?.toString());
      if (connectionEntry.ws === ws) {
        connectionEntry.ws = null;
        connectionEntry.ttlTimer = setTimeout(async () => {
          // Re-verify the connection wasn't re-attached during the TTL window
          if (connectionEntry.ws !== null) return;
          await destroyPoolEntry(connectionEntry);
          sessionPool.delete(poolKey);
        }, config.sessionPoolTtl);
      }
    });

    // WS rate limiting: sliding window per connection for user-initiated messages
    const rateLimitWindow: number[] = [];

    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        console.log('[WS-SERVER] Message from', userLogin, ':', msg.type);

        if (!msg.type || !VALID_MESSAGE_TYPES.has(msg.type)) {
          poolSend(connectionEntry, { type: 'error', message: 'Unknown message type' });
          return;
        }

        // Handle client-side heartbeat
        if (msg.type === 'ping') {
          connectionEntry.lastPingAt = Date.now();
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'pong' }));
          }
          return;
        }

        // Rate limit user-initiated message types
        if (RATE_LIMITED_TYPES.has(msg.type)) {
          const now = Date.now();
          // Prune expired entries
          while (rateLimitWindow.length > 0 && rateLimitWindow[0] <= now - WS_RATE_LIMIT_WINDOW_MS) {
            rateLimitWindow.shift();
          }
          if (rateLimitWindow.length >= WS_RATE_LIMIT_MAX) {
            poolSend(connectionEntry, { type: 'error', message: 'Rate limit exceeded — please slow down' });
            return;
          }
          rateLimitWindow.push(now);
        }

        const handler = messageHandlers[msg.type];
        if (handler) {
          const ctx: MessageContext = { connectionEntry, githubToken, userLogin, poolKey, ws };
          await handler(msg, ctx);
        }
      } catch (err: any) {
        console.error('WS message error:', err.message);
        connectionEntry.isProcessing = false;
        const errMsg = err?.message || 'An internal error occurred';
        const isTimeout = typeof errMsg === 'string' && errMsg.toLowerCase().includes('timeout');
        poolSend(connectionEntry, {
          type: 'error',
          message: isTimeout
            ? `Request timed out. The model took too long to respond — try again or start a new session. (${errMsg})`
            : errMsg,
        });
      }
    });

    ws.on('error', (err) => {
      console.error('WS error:', err.message);
    });
  });
}
