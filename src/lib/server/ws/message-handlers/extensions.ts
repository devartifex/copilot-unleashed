import { poolSend } from '../session-pool.js';
import type { MessageContext } from '../types.js';

export async function handleListExtensions(_msg: unknown, ctx: MessageContext): Promise<void> {
	const { connectionEntry } = ctx;

	if (!connectionEntry.session) {
		poolSend(connectionEntry, { type: 'error', message: 'No active session. Send new_session first.' });
		return;
	}
	try {
		const result = await connectionEntry.session.rpc.extensions.list();
		const extensions = (result?.extensions || []).map((e: any) => ({
			name: e.name,
			description: e.description,
			enabled: e.enabled,
		}));
		poolSend(connectionEntry, { type: 'extensions_list', extensions });
	} catch (err: any) {
		console.error('List extensions RPC error:', err.message);
		poolSend(connectionEntry, { type: 'error', message: `Failed to list extensions: ${err.message}` });
	}
}

export async function handleToggleExtension(msg: any, ctx: MessageContext): Promise<void> {
	const { connectionEntry } = ctx;

	if (!connectionEntry.session) {
		poolSend(connectionEntry, { type: 'error', message: 'No active session. Send new_session first.' });
		return;
	}
	const name = typeof msg.name === 'string' ? msg.name.trim() : '';
	if (!name) {
		poolSend(connectionEntry, { type: 'error', message: 'Extension name is required' });
		return;
	}
	if (typeof msg.enabled !== 'boolean') {
		poolSend(connectionEntry, { type: 'error', message: 'enabled (boolean) is required' });
		return;
	}
	try {
		if (msg.enabled) {
			await connectionEntry.session.rpc.extensions.enable({ name });
		} else {
			await connectionEntry.session.rpc.extensions.disable({ name });
		}
		console.log(`Extension ${name} ${msg.enabled ? 'enabled' : 'disabled'} for ${ctx.userLogin}`);
		poolSend(connectionEntry, { type: 'extension_toggled', name, enabled: msg.enabled });
	} catch (err: any) {
		console.error('Toggle extension RPC error:', err.message);
		poolSend(connectionEntry, { type: 'error', message: `Failed to toggle extension: ${err.message}` });
	}
}

export async function handleReloadExtensions(_msg: unknown, ctx: MessageContext): Promise<void> {
	const { connectionEntry } = ctx;

	if (!connectionEntry.session) {
		poolSend(connectionEntry, { type: 'error', message: 'No active session. Send new_session first.' });
		return;
	}
	try {
		await connectionEntry.session.rpc.extensions.reload();
		console.log(`Extensions reloaded for ${ctx.userLogin}`);
		poolSend(connectionEntry, { type: 'extensions_reloaded' });
	} catch (err: any) {
		console.error('Reload extensions RPC error:', err.message);
		poolSend(connectionEntry, { type: 'error', message: `Failed to reload extensions: ${err.message}` });
	}
}
