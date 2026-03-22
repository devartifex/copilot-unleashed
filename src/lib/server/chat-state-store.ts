import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PersistedChatState {
	userId: string;
	tabId: string;
	sdkSessionId: string | null;
	model: string;
	mode: string;
	messages: Array<Record<string, unknown>>;
	createdAt: number;
	updatedAt: number;
}

export interface ChatStateStore {
	save(userId: string, tabId: string, state: PersistedChatState): Promise<void>;
	load(userId: string, tabId: string): Promise<PersistedChatState | null>;
	delete(userId: string, tabId: string): Promise<void>;
	appendMessage(userId: string, tabId: string, message: Record<string, unknown>): Promise<void>;
	updateMetadata(
		userId: string,
		tabId: string,
		updates: Partial<Pick<PersistedChatState, 'sdkSessionId' | 'model' | 'mode'>>
	): Promise<void>;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_MESSAGES = 1000;
const CONTROL_MESSAGE_TYPES = new Set(['session_created', 'session_resumed', 'error', 'warning']);

// ─── Helpers ────────────────────────────────────────────────────────────────

function statePath(basePath: string, userId: string, tabId: string): string {
	return join(basePath, userId, `${tabId}.json`);
}

function isEnoent(err: unknown): boolean {
	return err instanceof Error && (err as NodeJS.ErrnoException).code === 'ENOENT';
}

async function atomicWrite(filePath: string, data: string): Promise<void> {
	const dir = join(filePath, '..');
	await mkdir(dir, { recursive: true });

	const tmpFile = join(dir, `.tmp-${Date.now()}-${randomUUID()}`);
	await writeFile(tmpFile, data, 'utf-8');
	await rename(tmpFile, filePath);
}

function trimMessages(messages: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
	if (messages.length <= MAX_MESSAGES) return messages;

	const result = [...messages];
	while (result.length > MAX_MESSAGES) {
		const idx = result.findIndex((m) => !CONTROL_MESSAGE_TYPES.has(m.type as string));
		if (idx === -1) break;
		result.splice(idx, 1);
	}
	return result;
}

// ─── Factory ────────────────────────────────────────────────────────────────

export function createChatStateStore(basePath: string): ChatStateStore {
	async function save(userId: string, tabId: string, state: PersistedChatState): Promise<void> {
		try {
			const filePath = statePath(basePath, userId, tabId);
			const toWrite = { ...state, messages: trimMessages(state.messages) };
			await atomicWrite(filePath, JSON.stringify(toWrite));
		} catch (err) {
			console.error(`[chat-state-store] save failed for ${userId}/${tabId}:`, err);
		}
	}

	async function load(userId: string, tabId: string): Promise<PersistedChatState | null> {
		try {
			const filePath = statePath(basePath, userId, tabId);
			const content = await readFile(filePath, 'utf-8');
			return JSON.parse(content) as PersistedChatState;
		} catch (err) {
			if (!isEnoent(err)) {
				console.error(`[chat-state-store] load failed for ${userId}/${tabId}:`, err);
			}
			return null;
		}
	}

	async function del(userId: string, tabId: string): Promise<void> {
		try {
			const filePath = statePath(basePath, userId, tabId);
			await unlink(filePath);
		} catch (err) {
			if (!isEnoent(err)) {
				console.error(`[chat-state-store] delete failed for ${userId}/${tabId}:`, err);
			}
		}
	}

	async function appendMessage(
		userId: string,
		tabId: string,
		message: Record<string, unknown>
	): Promise<void> {
		try {
			const existing = await load(userId, tabId);
			if (!existing) return;

			existing.messages.push(message);
			existing.messages = trimMessages(existing.messages);
			existing.updatedAt = Date.now();
			await save(userId, tabId, existing);
		} catch (err) {
			console.error(`[chat-state-store] appendMessage failed for ${userId}/${tabId}:`, err);
		}
	}

	async function updateMetadata(
		userId: string,
		tabId: string,
		updates: Partial<Pick<PersistedChatState, 'sdkSessionId' | 'model' | 'mode'>>
	): Promise<void> {
		try {
			const existing = await load(userId, tabId);
			if (!existing) return;

			Object.assign(existing, updates);
			existing.updatedAt = Date.now();
			await save(userId, tabId, existing);
		} catch (err) {
			console.error(`[chat-state-store] updateMetadata failed for ${userId}/${tabId}:`, err);
		}
	}

	return {
		save,
		load,
		delete: del,
		appendMessage,
		updateMetadata
	};
}
