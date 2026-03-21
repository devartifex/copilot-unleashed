import { WebSocketServer, WebSocket } from 'ws';
import { Server, IncomingMessage } from 'http';
import { join } from 'node:path';
import { approveAll } from '@github/copilot-sdk';
import { createCopilotClient } from '../copilot/client.js';
import { createCopilotSession, getAvailableModels, buildSessionHooks } from '../copilot/session.js';
import { enrichSessionMetadata, getSessionDetail, listSessionsFromFilesystem, buildSessionContext, deleteSessionFromFilesystem, isValidSessionId } from '../copilot/session-metadata.js';
import { config } from '../config.js';
import { logSecurity } from '../security-log.js';
import { validateGitHubToken } from '../auth/github.js';
import { checkAuth } from '../auth/guard.js';
import { getSkillDirectories } from '../skills/scanner.js';
import { clearAuth } from '../auth/session-utils.js';
import {
  sessionPool, createPoolEntry, destroyPoolEntry, poolSend,
  isValidTabId, countUserSessions, evictOldestUserSession,
} from './session-pool.js';
import type { SessionMiddleware } from './types.js';
import {
  MAX_MESSAGE_LENGTH, VALID_MESSAGE_TYPES, VALID_MODES, VALID_REASONING,
  HEARTBEAT_INTERVAL, RATE_LIMITED_TYPES, WS_RATE_LIMIT_MAX, WS_RATE_LIMIT_WINDOW_MS,
} from './constants.js';
import { isValidAttachmentPath, mapAttachmentsToSdk } from './attachments.js';
import { resolveFileMentions } from './file-mentions.js';
import { parseMcpServers } from './mcp-servers.js';
import { normalizeQuotaSnapshots } from './quota.js';
import { mapSessionEventsToHistory } from './session-history.js';
import { wireSessionEvents } from './session-events.js';
import { makeUserInputHandler, makePermissionHandler } from './permissions.js';

// Re-export utility functions for backward compatibility with existing tests
export { isValidAttachmentPath, mapAttachmentsToSdk } from './attachments.js';
export { parseMcpServers } from './mcp-servers.js';
export { resolveFileMentions } from './file-mentions.js';

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

      // Replay only messages the client hasn't seen (based on sequence numbers)
      const buffer = entry.messageBuffer.splice(0);
      for (const msg of buffer) {
        const msgSeq = typeof msg.seq === 'number' ? msg.seq : -1;
        if (msgSeq > lastSeq && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(msg));
        }
      }

      console.log('[WS-SERVER] Sending session_reconnected to', poolKey, 'hasSession:', !!entry.session);
      poolSend(entry, {
        type: 'session_reconnected',
        user: userLogin,
        hasSession: !!entry.session,
        isProcessing: entry.isProcessing,
      });

      // Re-send pending prompts so the user can respond on the new connection
      if (entry.pendingUserInputPrompt && entry.userInputResolve) {
        poolSend(entry, entry.pendingUserInputPrompt);
      }
      if (entry.pendingPermissionPrompt && entry.permissionResolve) {
        poolSend(entry, entry.pendingPermissionPrompt);
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

      console.log('[WS-SERVER] Sending connected to', poolKey);
      poolSend(entry, {
        type: 'connected',
        user: userLogin,
      });
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

        switch (msg.type) {
          case 'new_session': {
            if (connectionEntry.session) {
              try { await connectionEntry.session.disconnect(); } catch { /* ignore */ }
              connectionEntry.session = null;
            }
            connectionEntry.userInputResolve = null;
            connectionEntry.permissionResolve = null;
            connectionEntry.pendingUserInputPrompt = null;
            connectionEntry.pendingPermissionPrompt = null;

            try {
              const customInstructions = typeof msg.customInstructions === 'string'
                ? msg.customInstructions.slice(0, 2000)
                : undefined;

              const excludedTools = Array.isArray(msg.excludedTools)
                ? msg.excludedTools.filter((t: unknown) => typeof t === 'string')
                : undefined;

              const infiniteSessions = msg.infiniteSessions && typeof msg.infiniteSessions === 'object'
                ? {
                    enabled: msg.infiniteSessions.enabled !== false,
                    ...(typeof msg.infiniteSessions.backgroundThreshold === 'number' && {
                      backgroundCompactionThreshold: Math.max(0, Math.min(1, msg.infiniteSessions.backgroundThreshold)),
                    }),
                    ...(typeof msg.infiniteSessions.bufferThreshold === 'number' && {
                      bufferExhaustionThreshold: Math.max(0, Math.min(1, msg.infiniteSessions.bufferThreshold)),
                    }),
                  }
                : undefined;

              const permissionMode = msg.mode === 'autopilot' ? 'approve_all' as const : 'prompt' as const;

              const customTools = Array.isArray(msg.customTools) ? msg.customTools.slice(0, 10) : undefined;

              const mcpServers = parseMcpServers(msg.mcpServers);

              const disabledSkills = Array.isArray(msg.disabledSkills)
                ? msg.disabledSkills.filter((s: unknown) => typeof s === 'string')
                : undefined;

              const customAgents = Array.isArray(msg.customAgents)
                ? msg.customAgents
                    .filter((a: unknown) => {
                      if (!a || typeof a !== 'object') return false;
                      const obj = a as Record<string, unknown>;
                      return typeof obj.name === 'string' && typeof obj.prompt === 'string';
                    })
                    .slice(0, 10)
                    .map((a: unknown) => {
                      const obj = a as Record<string, unknown>;
                      return {
                        name: obj.name as string,
                        displayName: typeof obj.displayName === 'string' ? obj.displayName : undefined,
                        description: typeof obj.description === 'string' ? obj.description : undefined,
                        tools: Array.isArray(obj.tools)
                          ? (obj.tools as unknown[]).filter((t): t is string => typeof t === 'string')
                          : undefined,
                        prompt: obj.prompt as string,
                      };
                    })
                : undefined;

              const skillDirectories = await getSkillDirectories();

              connectionEntry.session = await createCopilotSession(connectionEntry.client, githubToken, {
                model: msg.model,
                reasoningEffort: msg.reasoningEffort,
                customInstructions,
                excludedTools,
                customTools,
                infiniteSessions,
                onUserInputRequest: makeUserInputHandler(connectionEntry),
                permissionMode,
                onPermissionRequest: makePermissionHandler(connectionEntry),
                mcpServers,
                configDir: config.copilotConfigDir,
                skillDirectories,
                disabledSkills,
                customAgents,
                onHookEvent: (message) => poolSend(connectionEntry, message),
              });

              wireSessionEvents(connectionEntry.session, connectionEntry, connectionEntry.session?.sessionId);

              // Set initial mode on the SDK session
              if (msg.mode && VALID_MODES.has(msg.mode)) {
                try {
                  await connectionEntry.session.rpc.mode.set({ mode: msg.mode });
                } catch (modeErr: any) {
                  console.warn('Initial mode set failed:', modeErr.message);
                }
              }

              poolSend(connectionEntry, {
                type: 'session_created',
                model: msg.model,
                sessionId: connectionEntry.session?.sessionId,
              });
            } catch (err: any) {
              console.error('Session creation error:', err.message);
              poolSend(connectionEntry, {
                type: 'error',
                message: `Failed to create session: ${err.message}`,
              });
            }
            break;
          }

          case 'message': {
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

            connectionEntry.isProcessing = true;
            const sendMode = msg.mode === 'immediate' || msg.mode === 'enqueue' ? msg.mode : undefined;
            await connectionEntry.session.send({
              prompt,
              ...(allAttachments.length ? { attachments: allAttachments } : {}),
              ...(sendMode ? { mode: sendMode } : {}),
            });
            break;
          }

          case 'list_models': {
            const models = await getAvailableModels(connectionEntry.client);
            const modelArray = Array.isArray(models) ? models : [];
            poolSend(connectionEntry, { type: 'models', models: modelArray });
            break;
          }

          case 'set_mode': {
            const mode = msg.mode;
            if (!mode || !VALID_MODES.has(mode)) {
              poolSend(connectionEntry, { type: 'error', message: 'Invalid mode. Use: interactive, plan, or autopilot' });
              return;
            }

            if (!connectionEntry.session) {
              poolSend(connectionEntry, { type: 'error', message: 'No active session. Send new_session first.' });
              return;
            }

            try {
              await connectionEntry.session.rpc.mode.set({ mode });

              // Update permission handler: autopilot auto-approves, others prompt the user
              if (mode === 'autopilot') {
                connectionEntry.session.registerPermissionHandler(approveAll);
              } else {
                connectionEntry.session.registerPermissionHandler(makePermissionHandler(connectionEntry));
              }

              // Note: mode_changed is sent by the SDK event handler (session.mode_changed)
            } catch (err: any) {
              console.error('Mode switch error:', err.message);
              poolSend(connectionEntry, { type: 'error', message: `Failed to switch mode: ${err.message}` });
            }
            break;
          }

          case 'abort': {
            if (!connectionEntry.session) {
              poolSend(connectionEntry, { type: 'error', message: 'No active session.' });
              return;
            }
            try {
              await connectionEntry.session.abort();
              connectionEntry.isProcessing = false;

              // Resolve any dangling input/permission promises to prevent leaks
              if (connectionEntry.userInputResolve) {
                const resolve = connectionEntry.userInputResolve;
                connectionEntry.userInputResolve = null;
                resolve({ answer: '', wasFreeform: false });
              }
              if (connectionEntry.permissionResolve) {
                const resolve = connectionEntry.permissionResolve;
                connectionEntry.permissionResolve = null;
                resolve('deny');
              }

              poolSend(connectionEntry, { type: 'aborted' });
            } catch (err: any) {
              console.error('Abort error:', err.message);
              poolSend(connectionEntry, { type: 'error', message: `Failed to abort: ${err.message}` });
            }
            break;
          }

          case 'set_model': {
            const newModel = typeof msg.model === 'string' ? msg.model.trim() : '';
            if (!newModel) {
              poolSend(connectionEntry, { type: 'error', message: 'Model ID is required' });
              return;
            }
            if (!connectionEntry.session) {
              poolSend(connectionEntry, { type: 'error', message: 'No active session. Send new_session first.' });
              return;
            }
            try {
              await connectionEntry.session.setModel(newModel);
              // Note: model_changed is sent by the SDK event handler (session.model_change)
            } catch (err: any) {
              console.error('Model change error:', err.message);
              poolSend(connectionEntry, { type: 'error', message: `Failed to change model: ${err.message}` });
            }
            break;
          }

          case 'set_reasoning': {
            const effort = msg.effort as string;
            if (!effort || !VALID_REASONING.has(effort)) {
              poolSend(connectionEntry, { type: 'error', message: 'Invalid reasoning effort. Use: low, medium, high, or xhigh' });
              return;
            }
            poolSend(connectionEntry, { type: 'reasoning_changed', effort });
            break;
          }

          case 'user_input_response': {
            if (!connectionEntry.userInputResolve) {
              poolSend(connectionEntry, { type: 'error', message: 'No pending input request' });
              return;
            }
            const answer = typeof msg.answer === 'string' ? msg.answer : '';
            if (!answer.trim()) {
              poolSend(connectionEntry, { type: 'error', message: 'Answer is required' });
              return;
            }
            const resolve = connectionEntry.userInputResolve;
            connectionEntry.userInputResolve = null;
            connectionEntry.pendingUserInputPrompt = null;
            resolve({ answer, wasFreeform: msg.wasFreeform ?? true });
            break;
          }

          case 'permission_response': {
            if (!connectionEntry.permissionResolve) {
              poolSend(connectionEntry, { type: 'error', message: 'No pending permission request' });
              return;
            }
            const decision = msg.decision;
            if (!['allow', 'deny', 'always_allow', 'always_deny'].includes(decision)) {
              poolSend(connectionEntry, { type: 'error', message: 'Invalid decision' });
              return;
            }
            // Key preferences by kind so "always allow shell" covers all shell commands
            const prefKey = msg.kind ?? msg.toolName;
            if (decision === 'always_allow') {
              connectionEntry.permissionPreferences.set(prefKey, 'allow');
            }
            if (decision === 'always_deny') {
              connectionEntry.permissionPreferences.set(prefKey, 'deny');
            }
            const permResolve = connectionEntry.permissionResolve;
            connectionEntry.permissionResolve = null;
            connectionEntry.pendingPermissionPrompt = null;
            permResolve(decision.replace('always_', ''));
            break;
          }

          case 'list_tools': {
            try {
              const model = typeof msg.model === 'string' ? msg.model : undefined;
              const result = await connectionEntry.client.rpc.tools.list({ model });
              poolSend(connectionEntry, { type: 'tools', tools: result?.tools || [] });
            } catch (err: any) {
              console.error('List tools error:', err.message);
              poolSend(connectionEntry, { type: 'tools', tools: [] });
            }
            break;
          }

          case 'list_agents': {
            if (!connectionEntry.session) {
              poolSend(connectionEntry, { type: 'error', message: 'No active session. Send new_session first.' });
              return;
            }
            try {
              const agents = await connectionEntry.session.rpc.agent.list();
              let current = null;
              try {
                current = await connectionEntry.session.rpc.agent.getCurrent();
              } catch { /* no current agent */ }
              poolSend(connectionEntry, { type: 'agents', agents: agents?.agents || [], current: current?.agent || null });
            } catch (err: any) {
              console.error('List agents error:', err.message);
              poolSend(connectionEntry, { type: 'agents', agents: [], current: null });
            }
            break;
          }

          case 'select_agent': {
            if (!connectionEntry.session) {
              poolSend(connectionEntry, { type: 'error', message: 'No active session. Send new_session first.' });
              return;
            }
            const agentName = typeof msg.name === 'string' ? msg.name.trim() : '';
            if (!agentName) {
              poolSend(connectionEntry, { type: 'error', message: 'Agent name is required' });
              return;
            }
            try {
              await connectionEntry.session.rpc.agent.select({ name: agentName });
              poolSend(connectionEntry, { type: 'agent_changed', agent: agentName });
            } catch (err: any) {
              console.error('Select agent error:', err.message);
              poolSend(connectionEntry, { type: 'error', message: `Failed to select agent: ${err.message}` });
            }
            break;
          }

          case 'deselect_agent': {
            if (!connectionEntry.session) {
              poolSend(connectionEntry, { type: 'error', message: 'No active session. Send new_session first.' });
              return;
            }
            try {
              await connectionEntry.session.rpc.agent.deselect();
              poolSend(connectionEntry, { type: 'agent_changed', agent: null });
            } catch (err: any) {
              console.error('Deselect agent error:', err.message);
              poolSend(connectionEntry, { type: 'error', message: `Failed to deselect agent: ${err.message}` });
            }
            break;
          }

          case 'get_quota': {
            try {
              const result = await connectionEntry.client.rpc.account.getQuota();
              poolSend(connectionEntry, {
                type: 'quota',
                quotaSnapshots: normalizeQuotaSnapshots(result.quotaSnapshots),
              });
            } catch (err: any) {
              console.error('Get quota error:', err.message);
              poolSend(connectionEntry, { type: 'error', message: `Failed to get quota: ${err.message}` });
            }
            break;
          }

          case 'compact': {
            if (!connectionEntry.session) {
              poolSend(connectionEntry, { type: 'error', message: 'No active session. Send new_session first.' });
              return;
            }
            try {
              const result = await connectionEntry.session.rpc.compaction.compact();
              poolSend(connectionEntry, { type: 'compaction_result', ...result });
            } catch (err: any) {
              console.error('Compaction error:', err.message);
              poolSend(connectionEntry, { type: 'error', message: `Failed to compact: ${err.message}` });
            }
            break;
          }

          case 'list_sessions': {
            try {
              // start() is idempotent — no-op if already connected
              console.log('[DEBUG list_sessions] Starting client…');
              await connectionEntry.client.start();
              console.log('[DEBUG list_sessions] client.listSessions()…');
              const sessions = await connectionEntry.client.listSessions();
              const rawList = Array.isArray(sessions) ? sessions : [];
              console.log('[DEBUG list_sessions] SDK returned', rawList.length, 'sessions');

              // Enrich each session with filesystem metadata in parallel
              const sdkSessions = await Promise.all(
                rawList.map(async (s: any) => {
                  const id = s.sessionId ?? s.id;
                  const enriched = await enrichSessionMetadata(id, s.context, s.isRemote);
                  return {
                    id,
                    title: s.summary ?? s.title,
                    updatedAt: s.modifiedTime ?? s.updatedAt,
                    model: s.model,
                    source: 'sdk' as const,
                    ...enriched,
                  };
                }),
              );

              // Merge with filesystem sessions the SDK may not know about
              // (e.g. bundled sessions copied into a fresh container)
              console.log('[DEBUG list_sessions] Scanning filesystem…');
              const fsSessions = await listSessionsFromFilesystem();
              console.log('[DEBUG list_sessions] Filesystem found', fsSessions.length, 'sessions');
              const sdkIds = new Set(sdkSessions.map((s) => s.id));
              const extraSessions = fsSessions.filter((s) => !sdkIds.has(s.id)).map((s) => ({ ...s, source: 'filesystem' as const }));
              const list = [...sdkSessions, ...extraSessions];
              console.log('[DEBUG list_sessions] Sending', list.length, 'total (SDK:', sdkSessions.length, '+ FS extra:', extraSessions.length, ')');

              poolSend(connectionEntry, { type: 'sessions', sessions: list });
            } catch (err: any) {
              console.error('[DEBUG list_sessions] SDK error:', err.message);
              // SDK failed — fall back to filesystem-only listing
              try {
                const fsSessions = await listSessionsFromFilesystem();
                console.log('[DEBUG list_sessions] Fallback: filesystem found', fsSessions.length, 'sessions');
                poolSend(connectionEntry, { type: 'sessions', sessions: fsSessions.map((s) => ({ ...s, source: 'filesystem' as const })) });
              } catch (fsErr: any) {
                console.error('[DEBUG list_sessions] Filesystem fallback also failed:', fsErr.message);
                poolSend(connectionEntry, { type: 'sessions', sessions: [] });
              }
            }
            break;
          }

          case 'delete_session': {
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
            break;
          }

          case 'get_session_detail': {
            const detailId = typeof msg.sessionId === 'string' ? msg.sessionId.trim() : '';
            console.log('[DEBUG get_session_detail] Requested:', JSON.stringify(detailId));
            if (!detailId) {
              console.log('[DEBUG get_session_detail] Empty ID, sending error');
              poolSend(connectionEntry, { type: 'error', message: 'Session ID is required' });
              return;
            }
            if (!isValidSessionId(detailId)) {
              poolSend(connectionEntry, { type: 'error', message: 'Invalid session ID format' });
              return;
            }

            try {
              console.log('[DEBUG get_session_detail] Calling getSessionDetail…');
              const detail = await getSessionDetail(detailId);
              console.log('[DEBUG get_session_detail] Result:', detail ? `found (id=${detail.id})` : 'null');
              if (!detail) {
                poolSend(connectionEntry, { type: 'error', message: 'Session not found' });
                return;
              }
              poolSend(connectionEntry, { type: 'session_detail', detail });
              console.log('[DEBUG get_session_detail] Sent session_detail response');
            } catch (err: any) {
              console.error('[DEBUG get_session_detail] Error:', err.message, err.stack);
              poolSend(connectionEntry, { type: 'error', message: `Failed to get session detail: ${err.message}` });
            }
            break;
          }

          case 'resume_session': {
            const sessionId = typeof msg.sessionId === 'string' ? msg.sessionId.trim() : '';
            if (!sessionId) {
              poolSend(connectionEntry, { type: 'error', message: 'Session ID is required' });
              return;
            }
            if (!isValidSessionId(sessionId)) {
              poolSend(connectionEntry, { type: 'error', message: 'Invalid session ID format' });
              return;
            }

            if (connectionEntry.session) {
              try { await connectionEntry.session.disconnect(); } catch { /* ignore */ }
              connectionEntry.session = null;
            }
            connectionEntry.userInputResolve = null;
            connectionEntry.permissionResolve = null;
            connectionEntry.isProcessing = false;

            try {
              // start() is idempotent — ensures the SDK has indexed all local sessions
              await connectionEntry.client.start();

              const resolvedConfigDir = config.copilotConfigDir || join((await import('node:os')).homedir(), '.copilot');

              // Read filesystem plan for injection into resumed session context
              const detail = await getSessionDetail(sessionId);

              // Parse MCP servers from the message so resumed sessions retain MCP access
              const resumeMcpServers = parseMcpServers(msg.mcpServers);

              // Build the full MCP config (GitHub server + user servers)
              const mcpServersConfig: Record<string, unknown> = {
                github: {
                  type: 'http',
                  url: 'https://api.githubcopilot.com/mcp/x/all',
                  headers: { Authorization: `Bearer ${githubToken}` },
                  tools: ['*'],
                },
              };
              if (resumeMcpServers) {
                for (const s of resumeMcpServers) {
                  mcpServersConfig[s.name] = {
                    type: s.type,
                    url: s.url,
                    headers: s.headers,
                    tools: s.tools.length > 0 ? s.tools : ['*'],
                  };
                }
              }

              let resumed = false;

              // Try native SDK resume first
              try {
                connectionEntry.session = await connectionEntry.client.resumeSession(sessionId, {
                  onPermissionRequest: (await import('@github/copilot-sdk')).approveAll,
                  streaming: true,
                  onUserInputRequest: makeUserInputHandler(connectionEntry),
                  hooks: buildSessionHooks((message) => poolSend(connectionEntry, message)),
                  configDir: resolvedConfigDir,
                  mcpServers: mcpServersConfig as any,
                  ...(detail?.plan && {
                    systemMessage: {
                      mode: 'append' as const,
                      content: `## Current Plan\n${detail.plan}`,
                    },
                  }),
                });
                resumed = true;
              } catch (resumeErr: any) {
                console.log(`[RESUME] SDK resumeSession failed for ${sessionId}: ${resumeErr.message}`);
              }

              // Fallback: create a new session with context from the filesystem session
              if (!resumed) {
                console.log(`[RESUME] Attempting context-based fallback for ${sessionId}…`);
                const context = await buildSessionContext(sessionId);
                if (!context) {
                  throw new Error(`Session not found: ${sessionId}`);
                }

                connectionEntry.session = await createCopilotSession(connectionEntry.client, githubToken, {
                  customInstructions: context,
                  onUserInputRequest: makeUserInputHandler(connectionEntry),
                  permissionMode: 'approve_all',
                  configDir: resolvedConfigDir,
                  mcpServers: resumeMcpServers,
                  onHookEvent: (message) => poolSend(connectionEntry, message),
                });
                console.log(`[RESUME] Fallback session created for ${sessionId} with context injection`);
              }

              wireSessionEvents(connectionEntry.session, connectionEntry, sessionId);

              // Read and send the restored session's mode to the client
              try {
                const modeResult = await connectionEntry.session.rpc.mode.get();
                if (modeResult?.mode && VALID_MODES.has(modeResult.mode)) {
                  poolSend(connectionEntry, { type: 'mode_changed', mode: modeResult.mode });
                  // Restore correct permission handler for resumed mode
                  if (modeResult.mode === 'autopilot') {
                    connectionEntry.session.registerPermissionHandler(approveAll);
                  } else {
                    connectionEntry.session.registerPermissionHandler(makePermissionHandler(connectionEntry));
                  }
                }
              } catch {
                // Non-critical: mode will default to interactive on client
              }

              // Restore the plan INTO the SDK so the agent's tools can access it
              if (detail?.plan) {
                try {
                  await connectionEntry.session.rpc.plan.update({ content: detail.plan });
                  console.log(`[RESUME] Plan restored into SDK for session ${sessionId}`);
                } catch (planErr: any) {
                  console.warn(`[RESUME] Failed to restore plan into SDK: ${planErr.message}`);
                }
              }

              // Read and send the restored session's plan to the client
              try {
                const planResult = await connectionEntry.session.rpc.plan.read();
                if (planResult?.exists) {
                  poolSend(connectionEntry, { type: 'plan', exists: true, content: planResult.content, path: planResult.path });
                }
              } catch {
                // Non-critical: plan panel will stay hidden
              }

              // Fetch and send conversation history for SDK-resumed sessions
              if (resumed) {
                try {
                  const historyEvents = await connectionEntry.session.getMessages();
                  const historyMessages = mapSessionEventsToHistory(historyEvents);
                  if (historyMessages.length > 0) {
                    poolSend(connectionEntry, { type: 'session_history', messages: historyMessages });
                    console.log(`[RESUME] Sent ${historyMessages.length} history messages for session ${sessionId}`);
                  }
                } catch (histErr: any) {
                  console.warn(`[RESUME] Failed to fetch session history: ${histErr.message}`);
                  // Non-critical: resume proceeds without history
                }
              }

              poolSend(connectionEntry, { type: 'session_resumed', sessionId });
            } catch (err: any) {
              console.error('Resume session error:', err.message);
              console.error('Resume session stack:', err.stack);
              poolSend(connectionEntry, { type: 'error', message: `Failed to resume session: ${err.message}` });
            }
            break;
          }

          case 'get_plan': {
            if (!connectionEntry.session) {
              poolSend(connectionEntry, { type: 'error', message: 'No active session. Send new_session first.' });
              return;
            }
            try {
              const result = await connectionEntry.session.rpc.plan.read();
              poolSend(connectionEntry, { type: 'plan', exists: result?.exists ?? false, content: result?.content, path: result?.path });
            } catch (err: any) {
              console.error('Get plan error:', err.message);
              poolSend(connectionEntry, { type: 'plan', exists: false });
            }
            break;
          }

          case 'update_plan': {
            if (!connectionEntry.session) {
              poolSend(connectionEntry, { type: 'error', message: 'No active session. Send new_session first.' });
              return;
            }
            const planContent = typeof msg.content === 'string' ? msg.content : '';
            try {
              await connectionEntry.session.rpc.plan.update({ content: planContent });
              poolSend(connectionEntry, { type: 'plan_updated' });
            } catch (err: any) {
              console.error('Update plan error:', err.message);
              poolSend(connectionEntry, { type: 'error', message: `Failed to update plan: ${err.message}` });
            }
            break;
          }

          case 'delete_plan': {
            if (!connectionEntry.session) {
              poolSend(connectionEntry, { type: 'error', message: 'No active session. Send new_session first.' });
              return;
            }
            try {
              await connectionEntry.session.rpc.plan.delete();
              poolSend(connectionEntry, { type: 'plan_deleted' });
            } catch (err: any) {
              console.error('Delete plan error:', err.message);
              poolSend(connectionEntry, { type: 'error', message: `Failed to delete plan: ${err.message}` });
            }
            break;
          }

          case 'start_fleet': {
            if (!connectionEntry.session) {
              poolSend(connectionEntry, { type: 'error', message: 'No active session. Send new_session first.' });
              return;
            }
            const prompt = typeof msg.prompt === 'string' ? msg.prompt.trim() : '';
            if (!prompt || prompt.length > MAX_MESSAGE_LENGTH) {
              poolSend(connectionEntry, { type: 'error', message: `Fleet prompt must be 1-${MAX_MESSAGE_LENGTH} characters` });
              return;
            }
            try {
              connectionEntry.isProcessing = true;
              const result = await connectionEntry.session.rpc.fleet.start({ prompt });
              poolSend(connectionEntry, { type: 'fleet_started', started: result.started });
            } catch (err: any) {
              console.error('Fleet start error:', err.message);
              connectionEntry.isProcessing = false;
              poolSend(connectionEntry, { type: 'error', message: `Failed to start fleet: ${err.message}` });
            }
            break;
          }
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
