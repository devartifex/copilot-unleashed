import { approveAll } from '@github/copilot-sdk';
import { poolSend } from '../session-pool.js';
import { VALID_MODES, VALID_REASONING } from '../constants.js';
import { makePermissionHandler } from '../permissions.js';
import type { MessageContext } from '../types.js';

export async function handleSetMode(msg: any, ctx: MessageContext): Promise<void> {
  const { connectionEntry } = ctx;
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
      connectionEntry.session.registerPermissionHandler(makePermissionHandler(connectionEntry, ctx.userLogin));
    }

    // Note: mode_changed is sent by the SDK event handler (session.mode_changed)
  } catch (err: any) {
    console.error('Mode switch error:', err.message);
    poolSend(connectionEntry, { type: 'error', message: `Failed to switch mode: ${err.message}` });
  }
}

export async function handleAbort(msg: any, ctx: MessageContext): Promise<void> {
  const { connectionEntry } = ctx;

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
}

export async function handleSetModel(msg: any, ctx: MessageContext): Promise<void> {
  const { connectionEntry } = ctx;

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
}

export async function handleSetReasoning(msg: any, ctx: MessageContext): Promise<void> {
  const { connectionEntry } = ctx;

  const effort = msg.effort as string;
  if (!effort || !VALID_REASONING.has(effort)) {
    poolSend(connectionEntry, { type: 'error', message: 'Invalid reasoning effort. Use: low, medium, high, or xhigh' });
    return;
  }
  poolSend(connectionEntry, { type: 'reasoning_changed', effort });
}
