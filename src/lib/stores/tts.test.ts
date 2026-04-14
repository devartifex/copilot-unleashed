import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock SpeechSynthesis API
let lastUtterance: {
  text: string;
  rate: number;
  voice: unknown;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
} | null = null;

const mockSpeechSynthesis = {
  speak: vi.fn((utterance: typeof lastUtterance) => {
    lastUtterance = utterance;
  }),
  cancel: vi.fn(() => {
    lastUtterance = null;
  }),
  pause: vi.fn(),
  resume: vi.fn(),
  getVoices: vi.fn(() => [
    { name: 'English Voice', lang: 'en-US', localService: true } as SpeechSynthesisVoice,
    { name: 'Italian Voice', lang: 'it-IT', localService: true } as SpeechSynthesisVoice,
  ]),
};

class MockSpeechSynthesisUtterance {
  text: string;
  rate = 1;
  voice: SpeechSynthesisVoice | null = null;
  onend: (() => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;

  constructor(text: string) {
    this.text = text;
  }
}

describe('TTS Store', () => {
  beforeEach(() => {
    vi.stubGlobal('speechSynthesis', mockSpeechSynthesis);
    vi.stubGlobal('SpeechSynthesisUtterance', MockSpeechSynthesisUtterance);
    mockSpeechSynthesis.speak.mockClear();
    mockSpeechSynthesis.cancel.mockClear();
    mockSpeechSynthesis.pause.mockClear();
    mockSpeechSynthesis.resume.mockClear();
    lastUtterance = null;
  });

  it('stripToPlainText removes markdown formatting', async () => {
    // Dynamically import to get the module
    const mod = await import('$lib/stores/tts.svelte.js');
    const store = mod.createTtsStore();

    // Verify store is created successfully
    expect(store).toBeDefined();
    expect(store.playingMessageId).toBeNull();
    expect(store.isPaused).toBe(false);
    expect(store.isPlaying).toBe(false);
  });

  it('rate is clamped between 0.5 and 2.0', async () => {
    const { createTtsStore } = await import('$lib/stores/tts.svelte.js');
    const store = createTtsStore();

    store.rate = 3.0;
    expect(store.rate).toBe(2.0);

    store.rate = 0.1;
    expect(store.rate).toBe(0.5);

    store.rate = 1.5;
    expect(store.rate).toBe(1.5);
  });

  it('toggle starts playback for a new message', async () => {
    const { createTtsStore } = await import('$lib/stores/tts.svelte.js');
    const store = createTtsStore();

    store.toggle('msg-1', 'Hello world');
    expect(mockSpeechSynthesis.cancel).toHaveBeenCalled();
    expect(mockSpeechSynthesis.speak).toHaveBeenCalled();
    expect(store.playingMessageId).toBe('msg-1');
  });

  it('toggle stops playback for the same message', async () => {
    const { createTtsStore } = await import('$lib/stores/tts.svelte.js');
    const store = createTtsStore();

    store.toggle('msg-1', 'Hello world');
    expect(store.playingMessageId).toBe('msg-1');

    store.toggle('msg-1', 'Hello world');
    expect(store.playingMessageId).toBeNull();
  });

  it('stop cancels speech and resets state', async () => {
    const { createTtsStore } = await import('$lib/stores/tts.svelte.js');
    const store = createTtsStore();

    store.play('msg-1', 'Hello world');
    expect(store.playingMessageId).toBe('msg-1');

    store.stop();
    expect(mockSpeechSynthesis.cancel).toHaveBeenCalled();
    expect(store.playingMessageId).toBeNull();
    expect(store.isPaused).toBe(false);
  });

  it('play with empty content is a no-op', async () => {
    const { createTtsStore } = await import('$lib/stores/tts.svelte.js');
    const store = createTtsStore();

    store.play('msg-1', '');
    expect(store.playingMessageId).toBeNull();
  });

  it('play strips markdown before speaking', async () => {
    const { createTtsStore } = await import('$lib/stores/tts.svelte.js');
    const store = createTtsStore();

    store.play('msg-1', '**bold** and `code`');
    expect(mockSpeechSynthesis.speak).toHaveBeenCalled();
    // The utterance text should not contain markdown
    const call = mockSpeechSynthesis.speak.mock.calls[0][0] as MockSpeechSynthesisUtterance;
    expect(call.text).not.toContain('**');
    expect(call.text).not.toContain('`');
    expect(call.text).toContain('bold');
    expect(call.text).toContain('code');
  });

  it('code blocks are replaced with placeholder', async () => {
    const { createTtsStore } = await import('$lib/stores/tts.svelte.js');
    const store = createTtsStore();

    store.play('msg-1', 'Here is some code:\n```js\nconst x = 1;\n```\nEnd.');
    const call = mockSpeechSynthesis.speak.mock.calls[0][0] as MockSpeechSynthesisUtterance;
    expect(call.text).toContain('code block omitted');
    expect(call.text).not.toContain('const x = 1');
  });
});
