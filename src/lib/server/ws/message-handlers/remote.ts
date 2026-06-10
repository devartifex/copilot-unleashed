import { config } from '../../config.js';
import { poolSend } from '../session-pool.js';
import { debug } from '../../logger.js';
import type { MessageContext } from '../types.js';

const VALID_REMOTE_MODES = new Set(['off', 'export', 'on']);

/**
 * Toggles remote session export/steering on the active session at runtime
 * via the SDK's experimental `session.rpc.remote` surface.
 *
 * msg.mode: "off" disables; "export" publishes events to GitHub;
 * "on" enables export + remote steering (github.com / Mobile).
 */
export async function handleRemoteToggle(msg: any, ctx: MessageContext): Promise<void> {
  const { connectionEntry } = ctx;

  if (!config.enableRemoteSessions) {
    poolSend(connectionEntry, { type: 'error', message: 'Remote sessions are disabled on this server' });
    return;
  }

  const session = connectionEntry.session;
  if (!session) {
    poolSend(connectionEntry, { type: 'error', message: 'No active session' });
    return;
  }

  // Fail-safe default for malformed input: export-only (non-steerable).
  const mode = typeof msg.mode === 'string' && VALID_REMOTE_MODES.has(msg.mode) ? msg.mode : 'export';

  try {
    if (mode === 'off') {
      await session.rpc.remote.disable();
      poolSend(connectionEntry, { type: 'remote_toggled', enabled: false });
      return;
    }

    const result = await session.rpc.remote.enable({ mode });
    poolSend(connectionEntry, { type: 'remote_toggled', enabled: true });
    if (result?.url) {
      poolSend(connectionEntry, { type: 'remote_session_url', url: result.url });
    }
    debug('[REMOTE] Enabled mode:', mode, 'steerable:', result?.remoteSteerable, 'url:', result?.url);
  } catch (err: any) {
    console.error('[REMOTE] Toggle error:', err.message);
    poolSend(connectionEntry, { type: 'error', message: `Failed to toggle remote session: ${err.message}` });
  }
}
