import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createChatStateStore, type PersistedChatState } from './chat-state-store.js';

function makeState(overrides: Partial<PersistedChatState> = {}): PersistedChatState {
	return {
		userId: 'user-1',
		tabId: 'tab-1',
		sdkSessionId: 'sdk-123',
		model: 'gpt-4.1',
		mode: 'autopilot',
		messages: [],
		createdAt: 1000,
		updatedAt: 1000,
		...overrides
	};
}

describe('ChatStateStore', () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), 'chat-state-store-test-'));
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	describe('save and load', () => {
		it('round-trips state to disk', async () => {
			const store = createChatStateStore(tempDir);
			const state = makeState({
				messages: [{ type: 'user', content: 'hello' }]
			});

			await store.save('user-1', 'tab-1', state);
			const loaded = await store.load('user-1', 'tab-1');

			expect(loaded).toEqual(state);
		});

		it('creates nested directories lazily', async () => {
			const store = createChatStateStore(tempDir);
			await store.save('user-1', 'tab-1', makeState());

			const dirs = await readdir(tempDir);
			expect(dirs).toContain('user-1');
		});

		it('returns null for non-existent state', async () => {
			const store = createChatStateStore(tempDir);
			const result = await store.load('no-user', 'no-tab');
			expect(result).toBeNull();
		});
	});

	describe('delete', () => {
		it('removes persisted file', async () => {
			const store = createChatStateStore(tempDir);
			await store.save('user-1', 'tab-1', makeState());

			await store.delete('user-1', 'tab-1');
			const loaded = await store.load('user-1', 'tab-1');
			expect(loaded).toBeNull();
		});

		it('does not throw for non-existent file', async () => {
			const store = createChatStateStore(tempDir);
			await expect(store.delete('no-user', 'no-tab')).resolves.toBeUndefined();
		});
	});

	describe('appendMessage', () => {
		it('appends a message to existing state', async () => {
			const store = createChatStateStore(tempDir);
			await store.save('user-1', 'tab-1', makeState({ messages: [{ type: 'user', content: 'first' }] }));

			await store.appendMessage('user-1', 'tab-1', { type: 'assistant', content: 'second' });

			const loaded = await store.load('user-1', 'tab-1');
			expect(loaded?.messages).toHaveLength(2);
			expect(loaded?.messages[1]).toEqual({ type: 'assistant', content: 'second' });
		});

		it('updates the updatedAt timestamp', async () => {
			const store = createChatStateStore(tempDir);
			await store.save('user-1', 'tab-1', makeState({ updatedAt: 1000 }));

			const before = Date.now();
			await store.appendMessage('user-1', 'tab-1', { type: 'user', content: 'msg' });
			const after = Date.now();

			const loaded = await store.load('user-1', 'tab-1');
			expect(loaded?.updatedAt).toBeGreaterThanOrEqual(before);
			expect(loaded?.updatedAt).toBeLessThanOrEqual(after);
		});

		it('ignores append when no existing state', async () => {
			const store = createChatStateStore(tempDir);
			await store.appendMessage('no-user', 'no-tab', { type: 'user', content: 'orphan' });

			const loaded = await store.load('no-user', 'no-tab');
			expect(loaded).toBeNull();
		});
	});

	describe('updateMetadata', () => {
		it('merges metadata updates into existing state', async () => {
			const store = createChatStateStore(tempDir);
			await store.save('user-1', 'tab-1', makeState({ model: 'gpt-4.1', mode: 'autopilot' }));

			await store.updateMetadata('user-1', 'tab-1', { model: 'claude-sonnet-4', mode: 'interactive' });

			const loaded = await store.load('user-1', 'tab-1');
			expect(loaded?.model).toBe('claude-sonnet-4');
			expect(loaded?.mode).toBe('interactive');
		});

		it('allows partial metadata updates', async () => {
			const store = createChatStateStore(tempDir);
			await store.save('user-1', 'tab-1', makeState({ sdkSessionId: 'old-id', model: 'gpt-4.1' }));

			await store.updateMetadata('user-1', 'tab-1', { sdkSessionId: 'new-id' });

			const loaded = await store.load('user-1', 'tab-1');
			expect(loaded?.sdkSessionId).toBe('new-id');
			expect(loaded?.model).toBe('gpt-4.1');
		});

		it('updates the updatedAt timestamp', async () => {
			const store = createChatStateStore(tempDir);
			await store.save('user-1', 'tab-1', makeState({ updatedAt: 1000 }));

			const before = Date.now();
			await store.updateMetadata('user-1', 'tab-1', { model: 'o4-mini' });
			const after = Date.now();

			const loaded = await store.load('user-1', 'tab-1');
			expect(loaded?.updatedAt).toBeGreaterThanOrEqual(before);
			expect(loaded?.updatedAt).toBeLessThanOrEqual(after);
		});

		it('ignores update when no existing state', async () => {
			const store = createChatStateStore(tempDir);
			await store.updateMetadata('no-user', 'no-tab', { model: 'o4-mini' });

			const loaded = await store.load('no-user', 'no-tab');
			expect(loaded).toBeNull();
		});
	});

	describe('max messages cap', () => {
		it('trims non-control messages when exceeding 1000', async () => {
			const store = createChatStateStore(tempDir);
			const messages: Array<Record<string, unknown>> = [];
			for (let i = 0; i < 1000; i++) {
				messages.push({ type: 'user', content: `msg-${i}` });
			}
			await store.save('user-1', 'tab-1', makeState({ messages }));

			await store.appendMessage('user-1', 'tab-1', { type: 'assistant', content: 'overflow' });

			const loaded = await store.load('user-1', 'tab-1');
			expect(loaded?.messages).toHaveLength(1000);
			expect(loaded?.messages[loaded.messages.length - 1]).toEqual({
				type: 'assistant',
				content: 'overflow'
			});
		});

		it('preserves control messages during trimming', async () => {
			const store = createChatStateStore(tempDir);
			const messages: Array<Record<string, unknown>> = [
				{ type: 'session_created', content: 'init' },
				{ type: 'error', content: 'oops' },
				{ type: 'warning', content: 'careful' },
				{ type: 'session_resumed', content: 'back' }
			];
			for (let i = 0; i < 998; i++) {
				messages.push({ type: 'user', content: `msg-${i}` });
			}
			await store.save('user-1', 'tab-1', makeState({ messages }));

			await store.appendMessage('user-1', 'tab-1', { type: 'assistant', content: 'new' });

			const loaded = await store.load('user-1', 'tab-1');
			expect(loaded?.messages).toHaveLength(1000);

			const controlMessages = loaded?.messages.filter((m) =>
				['session_created', 'session_resumed', 'error', 'warning'].includes(m.type as string)
			);
			expect(controlMessages).toHaveLength(4);
		});

		it('caps messages on save as well', async () => {
			const store = createChatStateStore(tempDir);
			const messages: Array<Record<string, unknown>> = [];
			for (let i = 0; i < 1050; i++) {
				messages.push({ type: 'user', content: `msg-${i}` });
			}

			await store.save('user-1', 'tab-1', makeState({ messages }));

			const loaded = await store.load('user-1', 'tab-1');
			expect(loaded?.messages).toHaveLength(1000);
		});
	});

	describe('atomic writes', () => {
		it('writes via tmp file then renames', async () => {
			const store = createChatStateStore(tempDir);
			await store.save('user-1', 'tab-1', makeState());

			// Verify the final file exists and no .tmp files remain
			const userDir = join(tempDir, 'user-1');
			const files = await readdir(userDir);
			expect(files).toEqual(['tab-1.json']);
			expect(files.every((f) => !f.includes('.tmp'))).toBe(true);
		});

		it('produces valid JSON on disk', async () => {
			const store = createChatStateStore(tempDir);
			const state = makeState({ messages: [{ type: 'user', content: 'test' }] });
			await store.save('user-1', 'tab-1', state);

			const raw = await readFile(join(tempDir, 'user-1', 'tab-1.json'), 'utf-8');
			expect(() => JSON.parse(raw)).not.toThrow();
			expect(JSON.parse(raw)).toEqual(state);
		});
	});

	describe('error handling', () => {
		it('logs but does not throw on save error', async () => {
			const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
			// Use an invalid path that will fail
			const store = createChatStateStore('/dev/null/impossible');

			await expect(store.save('user-1', 'tab-1', makeState())).resolves.toBeUndefined();
			expect(spy).toHaveBeenCalled();

			spy.mockRestore();
		});

		it('logs but does not throw on load error for non-ENOENT', async () => {
			const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
			const store = createChatStateStore('/dev/null/impossible');

			const result = await store.load('user-1', 'tab-1');
			expect(result).toBeNull();

			spy.mockRestore();
		});
	});
});
