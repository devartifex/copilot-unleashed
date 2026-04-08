import { join } from 'node:path';
import { approveAll } from '@github/copilot-sdk';
import { createCopilotSession, buildSessionHooks, buildSessionMcpServers } from '../../copilot/session.js';
import { getSessionDetail, buildSessionContext, isValidSessionId } from '../../copilot/session-metadata.js';
import { loadSessionTurns } from '../../copilot/session-store-db.js';
import { chatStateStore } from '../../chat-state-singleton.js';
import { config } from '../../config.js';
import { poolSend } from '../session-pool.js';
import { VALID_MODES } from '../constants.js';
import { wireSessionEvents, createCatchAllHandler, HANDLED_EVENT_TYPES } from '../session-events.js';
import { makeUserInputHandler, makePermissionHandler } from '../permissions.js';
import type { MessageContext } from '../types.js';

function rawTabId(ctx: MessageContext): string {
  return ctx.poolKey.split(':').slice(1).join(':');
}

export async function handleResumeSession(msg: any, ctx: MessageContext): Promise<void> {
  const { connectionEntry, githubToken } = ctx;

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
  connectionEntry.permissionResolves.clear();
  connectionEntry.pendingPermissionPrompts.clear();
  connectionEntry.isProcessing = false;

  try {
    // start() is idempotent — ensures the SDK has indexed all local sessions
    await connectionEntry.client.start();

    const resolvedConfigDir = config.copilotConfigDir || join((await import('node:os')).homedir(), '.copilot');

    // Read filesystem plan for injection into resumed session context
    const detail = await getSessionDetail(sessionId);

    // Build the full MCP config (GitHub server + config-file servers)
    const mcpServersConfig = await buildSessionMcpServers(githubToken, resolvedConfigDir);

    let resumed = false;

    const onEvent = createCatchAllHandler(connectionEntry, HANDLED_EVENT_TYPES);

    // Try native SDK resume first
    try {
      connectionEntry.session = await connectionEntry.client.resumeSession(sessionId, {
        onPermissionRequest: (await import('@github/copilot-sdk')).approveAll,
        streaming: true,
        onUserInputRequest: makeUserInputHandler(connectionEntry, ctx.userLogin),
        hooks: buildSessionHooks((message) => poolSend(connectionEntry, message)),
        configDir: resolvedConfigDir,
        mcpServers: mcpServersConfig as any,
        onEvent,
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
        onUserInputRequest: makeUserInputHandler(connectionEntry, ctx.userLogin),
        permissionMode: 'approve_all',
        configDir: resolvedConfigDir,
        onEvent,
        onHookEvent: (message) => poolSend(connectionEntry, message),
      });
      console.log(`[RESUME] Fallback session created for ${sessionId} with context injection`);
    }

    wireSessionEvents(connectionEntry.session, connectionEntry, sessionId, ctx.userLogin, ctx.poolKey.split(':').slice(1).join(':'));

    // Read and send the restored session's mode to the client
    let resumedMode = 'interactive';
    try {
      const modeResult = await connectionEntry.session.rpc.mode.get();
      if (modeResult?.mode && VALID_MODES.has(modeResult.mode)) {
        resumedMode = modeResult.mode;
        poolSend(connectionEntry, { type: 'mode_changed', mode: modeResult.mode });
        // Restore correct permission handler for resumed mode
        if (modeResult.mode === 'autopilot') {
          connectionEntry.session.registerPermissionHandler(approveAll);
        } else {
          connectionEntry.session.registerPermissionHandler(makePermissionHandler(connectionEntry, ctx.userLogin));
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

    // Load conversation history from session-store.db and send to browser
    try {
      const turns = loadSessionTurns(sessionId);
      if (turns.length > 0) {
        console.log(`[RESUME] Loaded ${turns.length} messages from session-store.db for ${sessionId}`);
        const resolvedModel = msg.model || 'gpt-4.1';
        poolSend(connectionEntry, {
          type: 'cold_resume',
          messages: turns,
          model: resolvedModel,
          mode: resumedMode,
          sdkSessionId: sessionId,
        });

        // Persist to chat-state so subsequent reconnects don't hit the DB again
        const tabId = rawTabId(ctx);
        chatStateStore.save(ctx.userLogin, tabId, {
          userId: ctx.userLogin,
          tabId,
          sdkSessionId: sessionId,
          model: resolvedModel,
          mode: resumedMode,
          messages: turns as unknown as Array<Record<string, unknown>>,
          createdAt: turns[0]?.timestamp || Date.now(),
          updatedAt: turns[turns.length - 1]?.timestamp || Date.now(),
        }).catch(() => {});
      }
    } catch (histErr: any) {
      console.warn(`[RESUME] Failed to load session history: ${histErr.message}`);
    }

    poolSend(connectionEntry, { type: 'session_resumed', sessionId });
  } catch (err: any) {
    console.error('Resume session error:', err.message);
    console.error('Resume session stack:', err.stack);
    poolSend(connectionEntry, { type: 'error', message: `Failed to resume session: ${err.message}` });
  }
}
