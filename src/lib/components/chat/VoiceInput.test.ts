import { describe, it, expect, vi, beforeEach } from 'vitest';

function createMockRecognition() {
  return {
    continuous: false,
    interimResults: false,
    lang: '',
    onresult: null as ((e: unknown) => void) | null,
    onend: null as (() => void) | null,
    onerror: null as ((e: unknown) => void) | null,
    start: vi.fn(),
    stop: vi.fn(),
    abort: vi.fn(),
  };
}

let mockInstance: ReturnType<typeof createMockRecognition>;

class MockSpeechRecognition {
  continuous = false;
  interimResults = false;
  lang = '';
  onresult: ((e: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
  abort = vi.fn();

  constructor() {
    mockInstance = this as unknown as ReturnType<typeof createMockRecognition>;
  }
}

describe('VoiceInput', () => {
  beforeEach(() => {
    vi.stubGlobal('SpeechRecognition', MockSpeechRecognition);
    vi.stubGlobal('webkitSpeechRecognition', undefined);
  });

  it('SpeechRecognition mock is set up correctly', () => {
    expect(globalThis.SpeechRecognition).toBeDefined();
    const instance = new MockSpeechRecognition();
    expect(instance.start).toBeDefined();
    expect(instance.stop).toBeDefined();
    expect(instance.abort).toBeDefined();
    expect(mockInstance).toBe(instance);
  });

  it('mock recognition fires events correctly', () => {
    const instance = new MockSpeechRecognition();
    const handler = vi.fn();
    instance.onresult = handler;

    const event = {
      resultIndex: 0,
      results: [{
        isFinal: true,
        0: { transcript: 'hello world', confidence: 0.95 },
        length: 1,
      }],
    };

    instance.onresult(event);
    expect(handler).toHaveBeenCalledWith(event);
  });

  it('mock recognition handles error events', () => {
    const instance = new MockSpeechRecognition();
    const handler = vi.fn();
    instance.onerror = handler;

    const errorEvent = { error: 'no-speech', message: 'No speech detected' };
    instance.onerror(errorEvent);
    expect(handler).toHaveBeenCalledWith(errorEvent);
  });

  it('mock recognition handles end events', () => {
    const instance = new MockSpeechRecognition();
    const handler = vi.fn();
    instance.onend = handler;

    instance.onend();
    expect(handler).toHaveBeenCalled();
  });
});
