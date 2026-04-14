import { poolSend } from '../session-pool.js';
import type { MessageContext } from '../types.js';

export async function handleUserInputResponse(msg: any, ctx: MessageContext): Promise<void> {
  const { connectionEntry } = ctx;

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
}

export async function handlePermissionResponse(msg: any, ctx: MessageContext): Promise<void> {
  const { connectionEntry } = ctx;

  const requestId = typeof msg.requestId === 'string' ? msg.requestId : '';
  const permResolve = requestId
    ? connectionEntry.permissionResolves.get(requestId)
    : connectionEntry.permissionResolves.values().next().value ?? null;

  if (!permResolve) {
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
  if (requestId) {
    connectionEntry.permissionResolves.delete(requestId);
    connectionEntry.pendingPermissionPrompts.delete(requestId);
  }
  permResolve(decision.replace('always_', ''));
}

export async function handleElicitationResponse(msg: any, ctx: MessageContext): Promise<void> {
  const { connectionEntry } = ctx;

  if (!connectionEntry.elicitationResolve) {
    poolSend(connectionEntry, { type: 'error', message: 'No pending elicitation request' });
    return;
  }

  const validActions = new Set(['accept', 'decline', 'cancel']);
  const action = (typeof msg.action === 'string' && validActions.has(msg.action)
    ? msg.action
    : 'cancel') as 'accept' | 'decline' | 'cancel';

  const resolve = connectionEntry.elicitationResolve;
  connectionEntry.elicitationResolve = null;
  connectionEntry.pendingElicitationPrompt = null;
  resolve({
    action,
    ...(action === 'accept' && msg.content ? { content: msg.content as Record<string, string | number | boolean | string[]> } : {}),
  });
}
