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
  let resolvedKey: string | undefined;
  let permResolve: ((decision: string) => void) | undefined;
  if (requestId) {
    const resolved = connectionEntry.permissionResolves.get(requestId);
    if (resolved) {
      resolvedKey = requestId;
      permResolve = resolved;
    }
  } else {
    // Fallback: resolve the oldest pending permission (insertion-order first entry).
    // Clients should always send a requestId; this path is a safety net only.
    for (const [key, resolve] of connectionEntry.permissionResolves) {
      resolvedKey = key;
      permResolve = resolve;
      break;
    }
  }

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
  if (resolvedKey) {
    connectionEntry.permissionResolves.delete(resolvedKey);
    connectionEntry.pendingPermissionPrompts.delete(resolvedKey);
  }
  permResolve(decision.replace('always_', ''));
}
