// Bridge between express-session (server.js) and SvelteKit routes.
// Uses globalThis so the same Map is shared between server.js (unbundled)
// and SvelteKit server code (bundled by adapter-node).

import type { SessionData } from './auth/guard.js';

const GLOBAL_KEY = '__copilotSessionMap';
const COUNTER_KEY = '__copilotSessionCounter';

const g = globalThis as Record<string, unknown>;

function getMap(): Map<string, SessionData> {
	if (!g[GLOBAL_KEY]) {
		g[GLOBAL_KEY] = new Map<string, SessionData>();
	}
	return g[GLOBAL_KEY] as Map<string, SessionData>;
}

export function registerSession(session: SessionData): string {
	g[COUNTER_KEY] = ((g[COUNTER_KEY] as number) || 0) + 1;
	const id = String(g[COUNTER_KEY]);
	getMap().set(id, session);
	return id;
}

export function getSessionById(id: string): SessionData | undefined {
	return getMap().get(id);
}

export function deleteSessionById(id: string): void {
	getMap().delete(id);
}
