import { poolSend } from '../session-pool.js';
import { normalizeQuotaSnapshots } from '../quota.js';
import type { MessageContext } from '../types.js';

export async function handleGetQuota(msg: any, ctx: MessageContext): Promise<void> {
  const { connectionEntry } = ctx;

  try {
    const result = await connectionEntry.client.rpc.account.getQuota();
    poolSend(connectionEntry, {
      type: 'quota',
      quotaSnapshots: normalizeQuotaSnapshots(result.quotaSnapshots),
    });
  } catch (err: any) {
    console.error('Get quota error:', err.message);
    poolSend(connectionEntry, { type: 'error', message: `Failed to get quota: ${err.message}` });
  }
}

export async function handleCompact(msg: any, ctx: MessageContext): Promise<void> {
  const { connectionEntry } = ctx;

  if (!connectionEntry.session) {
    poolSend(connectionEntry, { type: 'error', message: 'No active session. Send new_session first.' });
    return;
  }
  try {
    const result = await connectionEntry.session.rpc.compaction.compact();
    poolSend(connectionEntry, { type: 'compaction_result', ...result });
  } catch (err: any) {
    console.error('Compaction error:', err.message);
    poolSend(connectionEntry, { type: 'error', message: `Failed to compact: ${err.message}` });
  }
}
