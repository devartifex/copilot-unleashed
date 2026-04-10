import { poolSend } from '../session-pool.js';
import type { MessageContext } from '../types.js';

export async function handleShellExec(msg: any, ctx: MessageContext): Promise<void> {
	const { connectionEntry } = ctx;

	if (!connectionEntry.session) {
		poolSend(connectionEntry, { type: 'error', message: 'No active session. Send new_session first.' });
		return;
	}

	const command = typeof msg.command === 'string' ? msg.command : '';
	if (!command) {
		poolSend(connectionEntry, { type: 'error', message: 'command (string) is required' });
		return;
	}

	console.log(`[SHELL] User ${ctx.userLogin} executing: ${command}`);

	try {
		const params: { command: string; cwd?: string; timeout?: number } = { command };
		if (typeof msg.cwd === 'string') params.cwd = msg.cwd;
		if (typeof msg.timeout === 'number') params.timeout = msg.timeout;

		const result = await connectionEntry.session.rpc.shell.exec(params);
		poolSend(connectionEntry, {
			type: 'shell_exec_result',
			stdout: result?.stdout ?? '',
			stderr: result?.stderr ?? '',
			exitCode: result?.exitCode ?? null,
			...(result?.pid != null && { pid: result.pid }),
		});
	} catch (err: any) {
		console.error('Shell exec RPC error:', err.message);
		poolSend(connectionEntry, { type: 'error', message: `Shell exec failed: ${err.message}` });
	}
}

export async function handleShellKill(msg: any, ctx: MessageContext): Promise<void> {
	const { connectionEntry } = ctx;

	if (!connectionEntry.session) {
		poolSend(connectionEntry, { type: 'error', message: 'No active session. Send new_session first.' });
		return;
	}

	const pid = typeof msg.pid === 'number' ? msg.pid : NaN;
	if (!Number.isFinite(pid)) {
		poolSend(connectionEntry, { type: 'error', message: 'pid (number) is required' });
		return;
	}

	try {
		const result = await connectionEntry.session.rpc.shell.kill({ pid });
		poolSend(connectionEntry, {
			type: 'shell_kill_result',
			success: result?.success ?? true,
		});
	} catch (err: any) {
		console.error('Shell kill RPC error:', err.message);
		poolSend(connectionEntry, { type: 'error', message: `Shell kill failed: ${err.message}` });
	}
}
