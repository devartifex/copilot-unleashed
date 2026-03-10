// Bridge between express-session (server.js) and SvelteKit routes.
// Uses globalThis so the same Map is shared between server.js (unbundled)
// and SvelteKit server code (bundled by adapter-node).

const GLOBAL_KEY = '__copilotSessionMap';
const COUNTER_KEY = '__copilotSessionCounter';

function getMap(): Map<string, any> {
	if (!(globalThis as any)[GLOBAL_KEY]) {
		(globalThis as any)[GLOBAL_KEY] = new Map<string, any>();
	}
	return (globalThis as any)[GLOBAL_KEY];
}

export function registerSession(session: any): string {
	(globalThis as any)[COUNTER_KEY] = ((globalThis as any)[COUNTER_KEY] || 0) + 1;
	const id = String((globalThis as any)[COUNTER_KEY]);
	getMap().set(id, session);
	return id;
}

export function getSessionById(id: string): any | undefined {
	return getMap().get(id);
}

export function deleteSessionById(id: string): void {
	getMap().delete(id);
}
