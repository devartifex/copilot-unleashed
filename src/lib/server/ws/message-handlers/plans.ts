import { poolSend } from '../session-pool.js';
import type { MessageContext } from '../types.js';

export async function handleGetPlan(msg: any, ctx: MessageContext): Promise<void> {
  const { connectionEntry } = ctx;

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
}

export async function handleUpdatePlan(msg: any, ctx: MessageContext): Promise<void> {
  const { connectionEntry } = ctx;

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
}

export async function handleDeletePlan(msg: any, ctx: MessageContext): Promise<void> {
  const { connectionEntry } = ctx;

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
}
