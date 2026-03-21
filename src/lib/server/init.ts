import { startSessionWatcher, stopSessionWatcher } from './session-watcher.js';
import { broadcastToAll } from './ws/session-pool.js';
import { config } from './config.js';
import { resolve } from 'node:path';
import { homedir } from 'node:os';

let initialized = false;

export function initServerSideEffects(): void {
  if (initialized) return;
  initialized = true;

  // Start session filesystem watcher for CLI ↔ Browser autosync (best-effort)
  try {
    const copilotDir = config.copilotConfigDir || resolve(homedir(), '.copilot');
    const sessionStatePath = resolve(copilotDir, 'session-state');

    startSessionWatcher(sessionStatePath, () => {
      broadcastToAll({ type: 'sessions_changed' });
    });
  } catch (err) {
    console.warn(
      '[INIT] Session watcher failed to start:',
      err instanceof Error ? err.message : err,
    );
  }

  const shutdown = () => {
    stopSessionWatcher();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
