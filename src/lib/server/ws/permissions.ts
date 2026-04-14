import { WebSocket } from 'ws';
import { poolSend, type PoolEntry } from './session-pool.js';
import { sendPushToUser } from '../push/sender.js';
import { subscriptionStore } from '../push-singleton.js';
import type { ElicitationResult } from '@github/copilot-sdk';

export function makeUserInputHandler(entry: PoolEntry, userLogin?: string) {
  return (request: any) => {
    return new Promise<{ answer: string; wasFreeform: boolean }>((resolve) => {
      entry.userInputResolve = resolve;
      const prompt = {
        type: 'user_input_request',
        question: request.question,
        choices: request.choices,
        allowFreeform: request.allowFreeform ?? true,
      };
      entry.pendingUserInputPrompt = prompt;
      poolSend(entry, prompt);

      // Push notification when browser is closed
      if ((!entry.ws || entry.ws.readyState !== WebSocket.OPEN) && userLogin) {
        sendPushToUser(userLogin, {
          title: 'Copilot is asking you something',
          body: request.question?.slice(0, 100) || 'User input is needed',
          url: '/',
          tag: 'user-input-request',
        }, subscriptionStore).catch(() => {});
      }
    });
  };
}

const PERMISSION_TIMEOUT_MS = 300_000; // 5 minutes

function extractPermissionDisplay(request: any): {
  kind: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
} {
  const kind: string = request.kind ?? 'unknown';

  switch (kind) {
    case 'shell':
      return {
        kind,
        toolName: request.fullCommandText ?? 'shell command',
        toolArgs: {
          ...(request.intention && { intention: request.intention }),
          ...(request.possiblePaths?.length && { paths: request.possiblePaths }),
          ...(request.possibleUrls?.length && { urls: request.possibleUrls.map((u: any) => u.url) }),
          ...(request.warning && { warning: request.warning }),
        },
      };
    case 'write':
      return {
        kind,
        toolName: request.fileName ?? 'file',
        toolArgs: {
          ...(request.intention && { intention: request.intention }),
          ...(request.diff && { diff: request.diff }),
        },
      };
    case 'read':
      return {
        kind,
        toolName: request.path ?? 'file',
        toolArgs: {
          ...(request.intention && { intention: request.intention }),
        },
      };
    case 'mcp':
      return {
        kind,
        toolName: request.toolName ?? request.toolTitle ?? request.serverName ?? 'mcp tool',
        toolArgs: request.args ?? {},
      };
    case 'url':
      return {
        kind,
        toolName: request.url ?? 'url',
        toolArgs: {
          ...(request.intention && { intention: request.intention }),
        },
      };
    case 'custom-tool':
      return {
        kind,
        toolName: request.toolName ?? 'custom tool',
        toolArgs: request.args ?? {},
      };
    case 'memory':
      return {
        kind,
        toolName: request.subject ?? 'memory',
        toolArgs: {
          ...(request.fact && { fact: request.fact }),
          ...(request.citations && { citations: request.citations }),
        },
      };
    default:
      return {
        kind,
        toolName: request.toolName ?? request.tool?.name ?? kind,
        toolArgs: request.args ?? request.tool?.args ?? {},
      };
  }
}

export function makeElicitationHandler(entry: PoolEntry, userLogin?: string) {
  return (context: any) => {
    return new Promise<ElicitationResult>((resolve) => {
      // Auto-cancel any pending elicitation to prevent deadlocks
      if (entry.elicitationResolve) {
        const prev = entry.elicitationResolve;
        entry.elicitationResolve = null;
        entry.pendingElicitationPrompt = null;
        prev({ action: 'cancel' });
      }
      entry.elicitationResolve = resolve;
      const prompt = {
        type: 'elicitation_requested',
        elicitationId: context.elicitationId ?? `elic-${Date.now()}`,
        message: context.message,
        requestedSchema: context.requestedSchema,
        mode: context.mode,
        elicitationSource: context.elicitationSource,
      };
      entry.pendingElicitationPrompt = prompt;
      poolSend(entry, prompt);

      // Push notification when browser is closed
      if ((!entry.ws || entry.ws.readyState !== WebSocket.OPEN) && userLogin) {
        sendPushToUser(userLogin, {
          title: 'Copilot needs your input',
          body: context.message?.slice(0, 100) || 'A form needs your attention',
          url: '/',
          tag: 'elicitation-request',
        }, subscriptionStore).catch(() => {});
      }
    });
  };
}

export function makePermissionHandler(entry: PoolEntry, userLogin?: string) {
  return (request: any) => {
    const { kind, toolName, toolArgs } = extractPermissionDisplay(request);

    // Check remembered preferences keyed by kind (so "always allow shell" covers all shell cmds)
    const prefKey = kind;
    const remembered = entry.permissionPreferences.get(prefKey);
    if (remembered === 'allow') return Promise.resolve({ kind: 'approved' as const });
    if (remembered === 'deny') return Promise.resolve({ kind: 'denied-interactively-by-user' as const });

    const requestId = `perm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    return new Promise<{ kind: 'approved' } | { kind: 'denied-interactively-by-user'; feedback?: string }>((resolve) => {
      const timeout = setTimeout(() => {
        entry.permissionResolves.delete(requestId);
        entry.pendingPermissionPrompts.delete(requestId);
        resolve({ kind: 'denied-interactively-by-user', feedback: 'Permission request timed out' });
      }, PERMISSION_TIMEOUT_MS);

      entry.permissionResolves.set(requestId, (decision: string) => {
        clearTimeout(timeout);
        entry.pendingPermissionPrompts.delete(requestId);
        entry.permissionResolves.delete(requestId);
        resolve(
          decision === 'allow'
            ? { kind: 'approved' }
            : { kind: 'denied-interactively-by-user', feedback: 'User denied' },
        );
      });

      const prompt = {
        type: 'permission_request',
        requestId,
        kind,
        toolName,
        toolArgs,
      };
      entry.pendingPermissionPrompts.set(requestId, prompt);
      poolSend(entry, prompt);

      // Push notification when browser is closed
      if ((!entry.ws || entry.ws.readyState !== WebSocket.OPEN) && userLogin) {
        sendPushToUser(userLogin, {
          title: 'Tool approval needed',
          body: `${kind}: ${toolName}`.slice(0, 100),
          url: '/',
          tag: 'permission-request',
        }, subscriptionStore).catch(() => {});
      }
    });
  };
}
