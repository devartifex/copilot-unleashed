import { poolSend } from '../session-pool.js';
import type { MessageContext } from '../types.js';

export async function handleWorkspaceListFiles(_msg: any, ctx: MessageContext): Promise<void> {
	const { connectionEntry } = ctx;

	if (!connectionEntry.session) {
		poolSend(connectionEntry, { type: 'error', message: 'No active session. Send new_session first.' });
		return;
	}

	try {
		const result = await connectionEntry.session.rpc.workspace.listFiles();
		poolSend(connectionEntry, {
			type: 'workspace_files_list',
			files: result?.files ?? [],
		});
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		console.error('Workspace listFiles RPC error:', message);
		poolSend(connectionEntry, { type: 'error', message: 'Failed to list workspace files' });
	}
}

export async function handleWorkspaceReadFile(msg: any, ctx: MessageContext): Promise<void> {
	const { connectionEntry } = ctx;

	if (!connectionEntry.session) {
		poolSend(connectionEntry, { type: 'error', message: 'No active session. Send new_session first.' });
		return;
	}

	const path = typeof msg.path === 'string' ? msg.path : '';
	if (!path) {
		poolSend(connectionEntry, { type: 'error', message: 'path (string) is required' });
		return;
	}

	try {
		const result = await connectionEntry.session.rpc.workspace.readFile({ path });
		poolSend(connectionEntry, {
			type: 'workspace_file_content',
			path,
			content: result?.content ?? '',
		});
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		console.error('Workspace readFile RPC error:', message);
		poolSend(connectionEntry, { type: 'error', message: 'Failed to read file' });
	}
}

export async function handleWorkspaceCreateFile(msg: any, ctx: MessageContext): Promise<void> {
	const { connectionEntry } = ctx;

	if (!connectionEntry.session) {
		poolSend(connectionEntry, { type: 'error', message: 'No active session. Send new_session first.' });
		return;
	}

	const path = typeof msg.path === 'string' ? msg.path : '';
	if (!path) {
		poolSend(connectionEntry, { type: 'error', message: 'path (string) is required' });
		return;
	}
	if (typeof msg.content !== 'string') {
		poolSend(connectionEntry, { type: 'error', message: 'content (string) is required' });
		return;
	}

	try {
		await connectionEntry.session.rpc.workspace.createFile({ path, content: msg.content });
		poolSend(connectionEntry, {
			type: 'workspace_file_created',
			path,
		});
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		console.error('Workspace createFile RPC error:', message);
		poolSend(connectionEntry, { type: 'error', message: 'Failed to create file' });
	}
}
