import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSettingsStore } from '$lib/stores/settings.svelte.js';
import type {
  PersistedSettings,
} from '$lib/types/index.js';

const STORAGE_KEY = 'copilot-cli-settings';

function jsonResponse(data: unknown, ok = true): Response {
  return {
    ok,
    json: vi.fn().mockResolvedValue(data),
  } as unknown as Response;
}

describe('createSettingsStore', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
    localStorage.clear();
  });

  it('starts with the expected defaults', () => {
    const store = createSettingsStore();

    expect(store.selectedModel).toBe('');
    expect(store.selectedMode).toBe('interactive');
    expect(store.reasoningEffort).toBe('medium');
    expect(store.additionalInstructions).toBe('');
    expect(store.excludedTools).toEqual([]);
  });

  it('persists setter updates to localStorage and syncs them to the server', () => {
    const store = createSettingsStore();

    store.selectedModel = 'gpt-5';
    store.selectedMode = 'autopilot';
    store.reasoningEffort = 'high';
    store.additionalInstructions = 'Be concise';
    store.excludedTools = ['bash', 'grep'];

    const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as PersistedSettings;

    expect(persisted).toMatchObject({
      model: 'gpt-5',
      mode: 'autopilot',
      reasoningEffort: 'high',
      additionalInstructions: 'Be concise',
      excludedTools: ['bash', 'grep'],
    });
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(fetchMock).toHaveBeenLastCalledWith('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: persisted }),
    });
  });

  it('loads legacy customInstructions field for backward compatibility', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        customInstructions: 'legacy instructions',
      }),
    );
    const store = createSettingsStore();
    store.load();
    expect(store.additionalInstructions).toBe('legacy instructions');
  });

  it('loads valid persisted settings, filters invalid entries, and keeps mode interactive', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        model: 'claude-sonnet',
        mode: 'autopilot',
        reasoningEffort: 'xhigh',
        additionalInstructions: 'Use the docs',
        excludedTools: ['bash', 42, null],
      }),
    );

    const store = createSettingsStore();
    store.load();

    expect(store.selectedModel).toBe('claude-sonnet');
    expect(store.selectedMode).toBe('interactive');
    expect(store.reasoningEffort).toBe('xhigh');
    expect(store.additionalInstructions).toBe('Use the docs');
    expect(store.excludedTools).toEqual(['bash']);
  });

  it('ignores corrupt localStorage payloads', () => {
    localStorage.setItem(STORAGE_KEY, '{this is not valid json');

    const store = createSettingsStore();
    store.load();

    expect(store.selectedModel).toBe('');
    expect(store.selectedMode).toBe('interactive');
    expect(store.reasoningEffort).toBe('medium');
  });

  it('pulls settings from the server and rewrites localStorage with the sanitized result', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        settings: {
          model: 'gpt-4.1',
          mode: 'plan',
          reasoningEffort: 'low',
          additionalInstructions: 'Server wins',
          excludedTools: ['bash'],
        },
      }),
    );

    const store = createSettingsStore();
    await store.syncFromServer();

    expect(fetchMock).toHaveBeenCalledWith('/api/settings');
    expect(store.selectedModel).toBe('gpt-4.1');
    expect(store.selectedMode).toBe('interactive');
    expect(store.reasoningEffort).toBe('low');
    expect(store.additionalInstructions).toBe('Server wins');
    expect(store.excludedTools).toEqual(['bash']);

    const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as PersistedSettings;
    expect(persisted.mode).toBe('interactive');
    expect(persisted.model).toBe('gpt-4.1');
  });

  it('pushes local settings to the server when no server snapshot exists', async () => {
    const store = createSettingsStore();
    store.selectedModel = 'gpt-4o-mini';
    fetchMock.mockClear();
    fetchMock.mockResolvedValueOnce(jsonResponse({ settings: null }));

    await store.syncFromServer();

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/settings');
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        settings: {
          model: 'gpt-4o-mini',
          mode: 'interactive',
          reasoningEffort: 'medium',
          additionalInstructions: '',
          excludedTools: [],
          infiniteSessions: { enabled: true, backgroundThreshold: 0.80, bufferThreshold: 0.95 },
          notificationsEnabled: false,
        },
      }),
    });
  });
});
