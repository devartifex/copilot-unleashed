import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { poolSend, isClientUnreachable, type PoolEntry } from './session-pool.js';
import { normalizeQuotaSnapshots } from './quota.js';
import { getSessionStateDir } from '../copilot/session-metadata.js';
import { chatStateStore } from '../chat-state-singleton.js';
import { sendPushToUser } from '../push/sender.js';
import { subscriptionStore } from '../push-singleton.js';

export const HANDLED_EVENT_TYPES = new Set([
  'assistant.message_delta', 'assistant.reasoning_delta', 'assistant.reasoning',
  'assistant.intent', 'assistant.turn_start', 'assistant.turn_end', 'assistant.usage',
  'tool.execution_start', 'tool.execution_complete', 'tool.execution_progress',
  'tool.execution_partial_result',
  'session.mode_changed', 'session.error', 'session.title_changed',
  'session.warning', 'session.usage_info', 'session.info',
  'session.plan_changed', 'session.compaction_start', 'session.compaction_complete',
  'session.shutdown', 'session.model_change', 'session.idle', 'session.task_complete',
  'session.truncation', 'session.context_changed', 'session.workspace_file_changed',
  'subagent.started', 'subagent.completed', 'subagent.failed',
  'subagent.selected', 'subagent.deselected',
  'skill.invoked',
  'elicitation.requested', 'elicitation.completed',
  'exit_plan_mode.requested', 'exit_plan_mode.completed',
  'system.notification',
]);

// Events that are safe to silently ignore (high-frequency or SDK-internal)
const SUPPRESSED_EVENT_TYPES = new Set([
  'pending_messages.modified',
  'assistant.streaming_delta',
  'user.message',
  'hook.start',
  'hook.end',
  'session.mcp_servers_loaded',
  'session.tools_updated',
]);

export function createCatchAllHandler(entry: PoolEntry, handledTypes: Set<string>): (event: any) => void {
  return (event: any) => {
    if (!handledTypes.has(event.type) && !SUPPRESSED_EVENT_TYPES.has(event.type)) {
      console.log('[EVENT] unhandled SDK event:', event.type, JSON.stringify(event.data ?? {}).slice(0, 200));
    }
  };
}

export function wireSessionEvents(
  session: any,
  entry: PoolEntry,
  sessionId?: string,
  userLogin?: string,
  tabId?: string,
): void {
  // Accumulate assistant deltas so we can persist the full message on turn_end
  let pendingAssistantContent = '';

  session.on('assistant.message_delta', (event: any) => {
    pendingAssistantContent += event.data.deltaContent ?? '';
    poolSend(entry, { type: 'delta', content: event.data.deltaContent });
  });
  session.on('assistant.reasoning_delta', (event: any) => {
    poolSend(entry, { type: 'reasoning_delta', content: event.data.deltaContent, reasoningId: event.data.reasoningId });
  });
  session.on('assistant.reasoning', (event: any) => {
    poolSend(entry, { type: 'reasoning_done', reasoningId: event.data.reasoningId, content: event.data.content });
  });
  session.on('assistant.intent', (event: any) => {
    poolSend(entry, { type: 'intent', intent: event.data.intent });
  });
  session.on('assistant.turn_start', () => { poolSend(entry, { type: 'turn_start' }); });
  session.on('assistant.turn_end', () => {
    entry.isProcessing = false;
    poolSend(entry, { type: 'turn_end' });

    // Persist the accumulated assistant message (fire-and-forget)
    if (userLogin && tabId && pendingAssistantContent) {
      chatStateStore.appendMessage(userLogin, tabId, {
        type: 'assistant',
        content: pendingAssistantContent,
        timestamp: Date.now(),
      }).catch(() => {});
    }

    // Push notification when client is unreachable (WS closed or app backgrounded)
    if (isClientUnreachable(entry) && userLogin) {
      sendPushToUser(userLogin, {
        title: 'Response ready',
        body: pendingAssistantContent?.trim().slice(0, 100) || 'Your Copilot response is ready',
        url: '/',
        tag: 'response-ready',
      }, subscriptionStore).catch(() => {});
    }

    pendingAssistantContent = '';
  });
  session.on('tool.execution_start', (event: any) => {
    console.log('[TOOL] execution_start:', event.data.toolName, 'mcp:', event.data.mcpServerName, '/', event.data.mcpToolName);
    poolSend(entry, { type: 'tool_start', toolCallId: event.data.toolCallId, toolName: event.data.toolName, mcpServerName: event.data.mcpServerName, mcpToolName: event.data.mcpToolName });
  });
  session.on('tool.execution_complete', (event: any) => {
    console.log('[TOOL] execution_complete:', event.data.toolCallId);
    poolSend(entry, { type: 'tool_end', toolCallId: event.data.toolCallId });
  });
  session.on('tool.execution_progress', (event: any) => {
    console.log('[TOOL] execution_progress:', event.data.toolCallId, event.data.message);
    poolSend(entry, { type: 'tool_progress', toolCallId: event.data.toolCallId, message: event.data.message });
  });
  session.on('session.mode_changed', (event: any) => {
    poolSend(entry, { type: 'mode_changed', mode: event.data.newMode });
  });
  session.on('session.error', (event: any) => {
    console.error('[SESSION] error event:', event.data.message);
    poolSend(entry, { type: 'error', message: event.data.message });

    // Persist error for audit trail (fire-and-forget)
    if (userLogin && tabId) {
      chatStateStore.appendMessage(userLogin, tabId, {
        type: 'error',
        content: event.data.message,
        timestamp: Date.now(),
      }).catch(() => {});
    }

    // Push notification when client is unreachable (WS closed or app backgrounded)
    if (isClientUnreachable(entry) && userLogin) {
      sendPushToUser(userLogin, {
        title: 'Something went wrong',
        body: event.data.message?.slice(0, 100) || 'An error occurred in your Copilot session',
        url: '/',
        tag: 'session-error',
      }, subscriptionStore).catch(() => {});
    }
  });
  session.on('session.title_changed', (event: any) => {
    poolSend(entry, { type: 'title_changed', title: event.data.title });
  });
  session.on('assistant.usage', (event: any) => {
    poolSend(entry, {
      type: 'usage',
      inputTokens: event.data.inputTokens,
      outputTokens: event.data.outputTokens,
      totalTokens: event.data.totalTokens,
      reasoningTokens: event.data.reasoningTokens,
      cacheReadTokens: event.data.cacheReadTokens,
      cacheWriteTokens: event.data.cacheWriteTokens,
      duration: event.data.duration,
      cost: event.data.cost,
      quotaSnapshots: normalizeQuotaSnapshots(event.data.quotaSnapshots),
      copilotUsage: event.data.copilotUsage,
    });
  });
  session.on('session.warning', (event: any) => {
    poolSend(entry, { type: 'warning', message: event.data.message });
  });
  session.on('session.usage_info', (event: any) => {
    poolSend(entry, {
      type: 'context_info',
      tokenLimit: event.data.tokenLimit,
      currentTokens: event.data.currentTokens,
      messagesLength: event.data.messagesLength,
    });
  });
  session.on('subagent.started', (event: any) => {
    poolSend(entry, { type: 'subagent_start', agentName: event.data.agentName, description: event.data?.description });
  });
  session.on('subagent.completed', (event: any) => {
    poolSend(entry, { type: 'subagent_end', agentName: event.data.agentName });
  });
  session.on('session.info', (event: any) => {
    poolSend(entry, { type: 'info', message: event.data?.message || event.data });
  });
  session.on('session.plan_changed', (event: any) => {
    poolSend(entry, { type: 'plan_changed', content: event.data?.content, path: event.data?.path });
    // Read the full plan to sync UI + persist to disk
    session.rpc.plan.read()
      .then((plan: { exists?: boolean; content?: string; path?: string }) => {
        if (plan?.exists && plan.content != null) {
          // Send full plan to UI so the panel stays in sync
          poolSend(entry, { type: 'plan', exists: true, content: plan.content, path: plan.path });
          // Persist plan changes to disk for CLI bidirectional sync
          if (sessionId) {
            const sessionDir = join(getSessionStateDir(), sessionId);
            writeFile(join(sessionDir, 'plan.md'), plan.content, 'utf-8')
              .catch((err: Error) => console.warn(`[PLAN] Failed to sync plan.md for ${sessionId}:`, err.message));
          }
        }
      })
      .catch((err: Error) => console.warn(`[PLAN] Failed to read plan:`, err.message));
  });
  session.on('session.compaction_start', () => { poolSend(entry, { type: 'compaction_start' }); });
  session.on('session.compaction_complete', (event: any) => {
    poolSend(entry, {
      type: 'compaction_complete',
      tokensRemoved: event.data?.tokensRemoved,
      messagesRemoved: event.data?.messagesRemoved,
      preCompactionTokens: event.data?.preCompactionTokens,
      postCompactionTokens: event.data?.postCompactionTokens,
    });
  });
  session.on('session.shutdown', (event: any) => {
    poolSend(entry, {
      type: 'session_shutdown',
      totalPremiumRequests: event.data?.totalPremiumRequests,
      totalApiDurationMs: event.data?.totalApiDurationMs,
      sessionStartTime: event.data?.sessionStartTime,
    });
  });
  session.on('skill.invoked', (event: any) => {
    poolSend(entry, { type: 'skill_invoked', skillName: event.data?.skillName });
  });
  session.on('subagent.failed', (event: any) => {
    poolSend(entry, { type: 'subagent_failed', agentName: event.data?.agentName, error: event.data?.error });
  });
  session.on('subagent.selected', (event: any) => {
    poolSend(entry, { type: 'subagent_selected', agentName: event.data?.agentName });
  });
  session.on('subagent.deselected', (event: any) => {
    poolSend(entry, { type: 'subagent_deselected', agentName: event.data?.agentName });
  });
  session.on('session.model_change', (event: any) => {
    poolSend(entry, { type: 'model_changed', model: event.data?.model || event.data?.newModel, source: 'sdk' });
  });
  session.on('elicitation.requested', (event: any) => {
    poolSend(entry, { type: 'elicitation_requested', question: event.data?.question, choices: event.data?.choices, allowFreeform: event.data?.allowFreeform });

    // Push notification when client is unreachable (WS closed or app backgrounded)
    if (isClientUnreachable(entry) && userLogin) {
      sendPushToUser(userLogin, {
        title: 'Copilot is asking you something',
        body: event.data?.question?.slice(0, 100) || 'Your input is needed',
        url: '/',
        tag: 'elicitation-requested',
      }, subscriptionStore).catch(() => {});
    }
  });
  session.on('elicitation.completed', (event: any) => {
    poolSend(entry, { type: 'elicitation_completed', answer: event.data?.answer });
  });
  session.on('exit_plan_mode.requested', () => { poolSend(entry, { type: 'exit_plan_mode_requested' }); });
  session.on('exit_plan_mode.completed', () => { poolSend(entry, { type: 'exit_plan_mode_completed' }); });
  session.on('session.idle', (event: any) => {
    poolSend(entry, { type: 'session_idle', backgroundTasks: event.data?.backgroundTasks });
    const agents = event.data?.backgroundTasks?.agents;
    if (Array.isArray(agents) && agents.length > 0) {
      poolSend(entry, { type: 'fleet_status', agents });
    }
  });
  session.on('session.task_complete', (event: any) => {
    poolSend(entry, { type: 'task_complete', summary: event.data?.summary });
  });
  session.on('session.truncation', (event: any) => {
    poolSend(entry, {
      type: 'truncation',
      tokenLimit: event.data?.tokenLimit,
      preTruncationTokens: event.data?.preTruncationTokensInMessages,
      preTruncationMessages: event.data?.preTruncationMessagesLength,
      postTruncationTokens: event.data?.postTruncationTokensInMessages,
      postTruncationMessages: event.data?.postTruncationMessagesLength,
    });
  });
  session.on('tool.execution_partial_result', (event: any) => {
    poolSend(entry, { type: 'tool_partial_result', toolCallId: event.data?.toolCallId, partialOutput: event.data?.partialOutput });
  });
  session.on('session.context_changed', (event: any) => {
    entry.workspaceCwd = event.data?.cwd ?? entry.workspaceCwd;
    entry.workspaceGitRoot = event.data?.gitRoot ?? entry.workspaceGitRoot;
    poolSend(entry, {
      type: 'context_changed',
      cwd: event.data?.cwd,
      gitRoot: event.data?.gitRoot,
      repository: event.data?.repository,
      branch: event.data?.branch,
    });
  });
  session.on('session.workspace_file_changed', (event: any) => {
    poolSend(entry, { type: 'workspace_file_changed', path: event.data?.path, operation: event.data?.operation });
  });

  session.on('system.notification', (event: any) => {
    poolSend(entry, { type: 'system_notification', content: event.data?.content, kind: event.data?.kind });
  });

  // Catch-all: log unhandled event types for debugging / future audit
  session.on(createCatchAllHandler(entry, HANDLED_EVENT_TYPES));
}
