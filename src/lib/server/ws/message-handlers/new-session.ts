import { createCopilotSession } from '../../copilot/session.js';
import type { SystemPromptSection, SectionOverride } from '@github/copilot-sdk';
import { getSkillDirectories } from '../../skills/scanner.js';
import { config } from '../../config.js';
import { poolSend } from '../session-pool.js';
import { VALID_MODES } from '../constants.js';
import { parseMcpServers } from '../mcp-servers.js';
import { wireSessionEvents, createCatchAllHandler, HANDLED_EVENT_TYPES } from '../session-events.js';
import { makeUserInputHandler, makePermissionHandler } from '../permissions.js';
import { chatStateStore } from '../../chat-state-singleton.js';
import type { MessageContext } from '../types.js';

function rawTabId(ctx: MessageContext): string {
  return ctx.poolKey.split(':').slice(1).join(':');
}

export async function handleNewSession(msg: any, ctx: MessageContext): Promise<void> {
  const { connectionEntry, githubToken } = ctx;

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

    const validSections = new Set<string>([
      'identity', 'tone', 'tool_efficiency', 'environment_context',
      'code_change_rules', 'guidelines', 'safety', 'tool_instructions',
      'custom_instructions', 'last_instructions',
    ]);
    const validActions = new Set<string>(['replace', 'remove', 'append', 'prepend']);

    let systemPromptSections: Partial<Record<SystemPromptSection, SectionOverride>> | undefined;
    if (msg.systemPromptSections && typeof msg.systemPromptSections === 'object') {
      systemPromptSections = {};
      for (const [name, override] of Object.entries(msg.systemPromptSections as Record<string, unknown>)) {
        if (!validSections.has(name)) continue;
        const o = override as Record<string, unknown>;
        if (!o || typeof o !== 'object' || !validActions.has(o.action as string)) continue;
        systemPromptSections[name as SystemPromptSection] = {
          action: o.action as SectionOverride['action'],
          ...(typeof o.content === 'string' ? { content: o.content.slice(0, 5000) } : {}),
        };
      }
    }

    const skillDirectories = await getSkillDirectories();

    const agent = typeof msg.agent === 'string' ? msg.agent.trim() : undefined;

    const onEvent = createCatchAllHandler(connectionEntry, HANDLED_EVENT_TYPES);

    connectionEntry.session = await createCopilotSession(connectionEntry.client, githubToken, {
      model: msg.model,
      reasoningEffort: msg.reasoningEffort,
      customInstructions,
      excludedTools,
      customTools,
      infiniteSessions,
      onUserInputRequest: makeUserInputHandler(connectionEntry, ctx.userLogin),
      permissionMode,
      onPermissionRequest: makePermissionHandler(connectionEntry, ctx.userLogin),
      mcpServers,
      configDir: config.copilotConfigDir,
      skillDirectories,
      disabledSkills,
      customAgents,
      agent,
      onEvent,
      systemPromptSections,
      onHookEvent: (message) => poolSend(connectionEntry, message),
    });

    wireSessionEvents(connectionEntry.session, connectionEntry, connectionEntry.session?.sessionId, ctx.userLogin, rawTabId(ctx));

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

    // Store metadata for resume
    connectionEntry.sdkSessionId = connectionEntry.session?.sessionId ?? null;
    connectionEntry.model = msg.model ?? null;
    connectionEntry.mode = msg.mode ?? 'interactive';

    // Persist initial state (fire-and-forget)
    chatStateStore.save(ctx.userLogin, rawTabId(ctx), {
      userId: ctx.userLogin,
      tabId: rawTabId(ctx),
      sdkSessionId: connectionEntry.session?.sessionId ?? null,
      model: msg.model ?? 'gpt-4.1',
      mode: msg.mode ?? 'interactive',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }).catch(() => {});
  } catch (err: any) {
    console.error('Session creation error:', err.message);
    poolSend(connectionEntry, {
      type: 'error',
      message: `Failed to create session: ${err.message}`,
    });
  }
}
