import { poolSend } from '../session-pool.js';
import { MAX_MESSAGE_LENGTH } from '../constants.js';
import type { MessageContext } from '../types.js';

export async function handleStartFleet(msg: any, ctx: MessageContext): Promise<void> {
  const { connectionEntry } = ctx;

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
}
