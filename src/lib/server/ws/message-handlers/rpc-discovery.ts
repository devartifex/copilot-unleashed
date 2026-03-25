import { poolSend } from '../session-pool.js';
import type { MessageContext } from '../types.js';
import { scanCustomizations } from '../../customizations/scanner.js';
import { config } from '../../config.js';

export async function handleListSkillsRpc(_msg: any, ctx: MessageContext): Promise<void> {
	const { connectionEntry } = ctx;

	if (!connectionEntry.session) {
		poolSend(connectionEntry, { type: 'error', message: 'No active session. Send new_session first.' });
		return;
	}
	try {
		const result = await connectionEntry.session.rpc.skills.list();
		const skills = (result?.skills || []).map((s: any) => ({
			...s,
			source: s.source === 'personal' ? 'user' : s.source === 'project' ? 'repo' : 'builtin',
		}));
		poolSend(connectionEntry, { type: 'skills_list', skills });
	} catch (err: any) {
		console.error('List skills RPC error:', err.message);
		poolSend(connectionEntry, { type: 'error', message: `Failed to list skills: ${err.message}` });
	}
}

export async function handleToggleSkillRpc(msg: any, ctx: MessageContext): Promise<void> {
	const { connectionEntry } = ctx;

	if (!connectionEntry.session) {
		poolSend(connectionEntry, { type: 'error', message: 'No active session. Send new_session first.' });
		return;
	}
	const name = typeof msg.name === 'string' ? msg.name.trim() : '';
	if (!name) {
		poolSend(connectionEntry, { type: 'error', message: 'Skill name is required' });
		return;
	}
	if (typeof msg.enabled !== 'boolean') {
		poolSend(connectionEntry, { type: 'error', message: 'enabled (boolean) is required' });
		return;
	}
	try {
		if (msg.enabled) {
			await connectionEntry.session.rpc.skills.enable({ name });
		} else {
			await connectionEntry.session.rpc.skills.disable({ name });
		}
		console.log(`Skill ${name} ${msg.enabled ? 'enabled' : 'disabled'} for ${ctx.userLogin}`);
		poolSend(connectionEntry, { type: 'skill_toggled', name, enabled: msg.enabled });
	} catch (err: any) {
		console.error('Toggle skill RPC error:', err.message);
		poolSend(connectionEntry, { type: 'error', message: `Failed to toggle skill: ${err.message}` });
	}
}

export async function handleReloadSkills(_msg: any, ctx: MessageContext): Promise<void> {
	const { connectionEntry } = ctx;

	if (!connectionEntry.session) {
		poolSend(connectionEntry, { type: 'error', message: 'No active session. Send new_session first.' });
		return;
	}
	try {
		await connectionEntry.session.rpc.skills.reload();
		console.log(`Skills reloaded for ${ctx.userLogin}`);
		poolSend(connectionEntry, { type: 'skills_reloaded' });
	} catch (err: any) {
		console.error('Reload skills RPC error:', err.message);
		poolSend(connectionEntry, { type: 'error', message: `Failed to reload skills: ${err.message}` });
	}
}

export async function handleListMcpRpc(_msg: any, ctx: MessageContext): Promise<void> {
	const { connectionEntry } = ctx;

	if (!connectionEntry.session) {
		poolSend(connectionEntry, { type: 'error', message: 'No active session. Send new_session first.' });
		return;
	}
	try {
		const result = await connectionEntry.session.rpc.mcp.list();
		const servers = (result?.servers || []).map((s: any) => ({
			...s,
			source: s.source === 'user' ? 'user' : s.source === 'workspace' ? 'repo' : 'builtin',
		}));
		poolSend(connectionEntry, { type: 'mcp_servers_list', servers });
	} catch (err: any) {
		console.error('List MCP servers RPC error:', err.message);
		poolSend(connectionEntry, { type: 'error', message: `Failed to list MCP servers: ${err.message}` });
	}
}

export async function handleToggleMcpRpc(msg: any, ctx: MessageContext): Promise<void> {
	const { connectionEntry } = ctx;

	if (!connectionEntry.session) {
		poolSend(connectionEntry, { type: 'error', message: 'No active session. Send new_session first.' });
		return;
	}
	const name = typeof msg.name === 'string' ? msg.name.trim() : '';
	if (!name) {
		poolSend(connectionEntry, { type: 'error', message: 'MCP server name is required' });
		return;
	}
	if (typeof msg.enabled !== 'boolean') {
		poolSend(connectionEntry, { type: 'error', message: 'enabled (boolean) is required' });
		return;
	}
	try {
		if (msg.enabled) {
			await connectionEntry.session.rpc.mcp.enable({ name });
		} else {
			await connectionEntry.session.rpc.mcp.disable({ name });
		}
		console.log(`MCP server ${name} ${msg.enabled ? 'enabled' : 'disabled'} for ${ctx.userLogin}`);
		poolSend(connectionEntry, { type: 'mcp_server_toggled', name, enabled: msg.enabled });
	} catch (err: any) {
		console.error('Toggle MCP server RPC error:', err.message);
		poolSend(connectionEntry, { type: 'error', message: `Failed to toggle MCP server: ${err.message}` });
	}
}

export async function handleListInstructions(_msg: any, ctx: MessageContext): Promise<void> {
	const { connectionEntry } = ctx;
	try {
		const customizations = await scanCustomizations(config.copilotConfigDir, config.copilotCwd);
		const instructions = customizations.instructions.map(({ name, source, path, applyTo }) => ({
			name,
			source,
			path,
			...(applyTo && { applyTo }),
		}));
		poolSend(connectionEntry, { type: 'instructions_list', instructions });
	} catch (err: any) {
		console.error('List instructions error:', err.message);
		poolSend(connectionEntry, { type: 'error', message: `Failed to list instructions: ${err.message}` });
	}
}

export async function handleListPrompts(_msg: any, ctx: MessageContext): Promise<void> {
	const { connectionEntry } = ctx;
	try {
		const customizations = await scanCustomizations(config.copilotConfigDir, config.copilotCwd);
		const prompts = customizations.prompts.map(({ name, source, path, description, content }) => ({
			name,
			source,
			path,
			description,
			content,
		}));
		poolSend(connectionEntry, { type: 'prompts_list', prompts });
	} catch (err: any) {
		console.error('List prompts error:', err.message);
		poolSend(connectionEntry, { type: 'error', message: `Failed to list prompts: ${err.message}` });
	}
}

export async function handleUsePrompt(msg: any, ctx: MessageContext): Promise<void> {
	const { connectionEntry } = ctx;
	const name = typeof msg.name === 'string' ? msg.name.trim() : '';
	if (!name) {
		poolSend(connectionEntry, { type: 'error', message: 'Prompt name is required' });
		return;
	}
	try {
		const customizations = await scanCustomizations(config.copilotConfigDir, config.copilotCwd);
		const prompt = customizations.prompts.find(p => p.name === name);
		if (!prompt) {
			poolSend(connectionEntry, { type: 'error', message: `Prompt not found: ${name}` });
			return;
		}
		poolSend(connectionEntry, { type: 'prompt_content', name: prompt.name, content: prompt.content });
	} catch (err: any) {
		console.error('Use prompt error:', err.message);
		poolSend(connectionEntry, { type: 'error', message: `Failed to get prompt: ${err.message}` });
	}
}
