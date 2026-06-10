import { createCopilotSession } from '../../copilot/session.js';
import { chatStateStore } from '../../chat-state-singleton.js';
import { config } from '../../config.js';
import { poolSend } from '../session-pool.js';
import { VALID_MODES } from '../constants.js';
import { wireSessionEvents, createCatchAllHandler, HANDLED_EVENT_TYPES } from '../session-events.js';
import { makeUserInputHandler, makePermissionHandler, makeElicitationHandler } from '../permissions.js';
import { getSkillDirectories } from '../../skills/scanner.js';
import type { MessageContext } from '../types.js';

// GitHub owner: alphanumeric + hyphens, no leading/trailing hyphen, max 39 chars.
const OWNER_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;
// GitHub repo name: alphanumeric, hyphen, underscore, dot; max 100 chars.
const REPO_RE = /^[a-zA-Z0-9._-]{1,100}$/;
// Git branch: conservative allowlist (no control chars, spaces, or git-invalid sequences).
const BRANCH_RE = /^(?!.*\.\.)(?!.*\/$)[a-zA-Z0-9](?:[a-zA-Z0-9._\/-]{0,254})$/;

function rawTabId(ctx: MessageContext): string {
  return ctx.poolKey.split(':').slice(1).join(':');
}

interface CloudRepositoryInput {
  owner: string;
  name: string;
  branch?: string;
}

function parseRepository(raw: unknown): CloudRepositoryInput | { error: string } | null {
  if (raw == null) return null;
  if (typeof raw !== 'object') return { error: 'repository must be an object' };

  const obj = raw as Record<string, unknown>;
  const owner = typeof obj.owner === 'string' ? obj.owner.trim() : '';
  const name = typeof obj.name === 'string' ? obj.name.trim() : '';
  const branch = typeof obj.branch === 'string' ? obj.branch.trim() : undefined;

  if (!OWNER_RE.test(owner)) return { error: 'Invalid repository owner' };
  if (!REPO_RE.test(name)) return { error: 'Invalid repository name' };
  if (branch !== undefined && branch !== '' && !BRANCH_RE.test(branch)) {
    return { error: 'Invalid branch name' };
  }

  return { owner, name, ...(branch ? { branch } : {}) };
}

/**
 * Creates a session that runs on GitHub's cloud agent infrastructure
 * instead of locally. The session ID is assigned server-side by GitHub.
 */
export async function handleNewCloudSession(msg: any, ctx: MessageContext): Promise<void> {
  const { connectionEntry, githubToken } = ctx;

  if (!config.enableRemoteSessions) {
    poolSend(connectionEntry, { type: 'error', message: 'Remote sessions are disabled on this server' });
    return;
  }

  const repository = parseRepository(msg.repository);
  if (repository && 'error' in repository) {
    poolSend(connectionEntry, { type: 'error', message: repository.error });
    return;
  }

  // Delete old persisted state before creating new session
  chatStateStore.delete(ctx.userLogin, rawTabId(ctx));

  if (connectionEntry.session) {
    try { await connectionEntry.session.disconnect(); } catch { /* ignore */ }
    connectionEntry.session = null;
  }
  connectionEntry.userInputResolve = null;
  connectionEntry.permissionResolves.clear();
  connectionEntry.pendingUserInputPrompt = null;
  connectionEntry.pendingPermissionPrompts.clear();

  try {
    const skillDirectories = await getSkillDirectories();
    const onEvent = createCatchAllHandler(connectionEntry, HANDLED_EVENT_TYPES);

    connectionEntry.session = await createCopilotSession(connectionEntry.client, githubToken, {
      model: msg.model,
      reasoningEffort: msg.reasoningEffort,
      onUserInputRequest: makeUserInputHandler(connectionEntry, ctx.userLogin),
      permissionMode: msg.mode === 'autopilot' ? 'approve_all' : 'prompt',
      onPermissionRequest: makePermissionHandler(connectionEntry, ctx.userLogin),
      onElicitationRequest: makeElicitationHandler(connectionEntry, ctx.userLogin),
      configDir: config.copilotConfigDir,
      skillDirectories,
      onEvent,
      cloud: repository ? { repository } : {},
      onHookEvent: (message) => poolSend(connectionEntry, message),
    });

    wireSessionEvents(connectionEntry.session, connectionEntry, connectionEntry.session?.sessionId, ctx.userLogin, rawTabId(ctx));

    if (msg.mode && VALID_MODES.has(msg.mode)) {
      try {
        await connectionEntry.session.rpc.mode.set({ mode: msg.mode });
      } catch (modeErr: any) {
        console.warn('Initial mode set failed for cloud session:', modeErr.message);
      }
    }

    const sessionId = connectionEntry.session?.sessionId;
    poolSend(connectionEntry, {
      type: 'cloud_session_created',
      sessionId,
      model: msg.model,
      ...(repository ? { repository } : {}),
    });

    connectionEntry.sdkSessionId = sessionId ?? null;
    connectionEntry.model = msg.model ?? null;
    connectionEntry.mode = msg.mode ?? 'interactive';

    chatStateStore.save(ctx.userLogin, rawTabId(ctx), {
      userId: ctx.userLogin,
      tabId: rawTabId(ctx),
      sdkSessionId: sessionId ?? null,
      model: msg.model ?? '',
      mode: msg.mode ?? 'interactive',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }).catch(() => {});
  } catch (err: any) {
    console.error('Cloud session creation error:', err.message);
    poolSend(connectionEntry, {
      type: 'error',
      message: `Failed to create cloud session: ${err.message}`,
    });
  }
}
