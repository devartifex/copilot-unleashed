const SUPPORTED = typeof window !== 'undefined' && 'speechSynthesis' in window;

/** Strip markdown/HTML to plain text suitable for speech synthesis. */
function stripToPlainText(markdown: string): string {
  return markdown
    // Remove code blocks (``` ... ```)
    .replace(/```[\s\S]*?```/g, ' code block omitted ')
    // Remove inline code
    .replace(/`([^`]+)`/g, '$1')
    // Remove images
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    // Remove links — keep text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove headings markers
    .replace(/^#{1,6}\s+/gm, '')
    // Remove bold/italic markers
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')
    .replace(/_{1,3}([^_]+)_{1,3}/g, '$1')
    // Remove strikethrough
    .replace(/~~([^~]+)~~/g, '$1')
    // Remove blockquotes
    .replace(/^>\s+/gm, '')
    // Remove horizontal rules
    .replace(/^[-*_]{3,}\s*$/gm, '')
    // Remove HTML tags
    .replace(/<[^>]+>/g, '')
    // Collapse multiple newlines/spaces
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Split text into sentence-sized chunks for smoother TTS. */
function splitIntoChunks(text: string): string[] {
  // Split on sentence boundaries, keeping punctuation
  const sentences = text.match(/[^.!?]+[.!?]+[\s]*/g);
  if (!sentences) return text.length > 0 ? [text] : [];

  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    // Keep chunks under ~200 chars for responsive playback
    if (current.length + sentence.length > 200 && current.length > 0) {
      chunks.push(current.trim());
      current = '';
    }
    current += sentence;
  }
  if (current.trim()) {
    chunks.push(current.trim());
  }
  return chunks;
}

export interface TtsStore {
  readonly supported: boolean;
  readonly playingMessageId: string | null;
  readonly isPaused: boolean;
  readonly isPlaying: boolean;
  readonly autoRead: boolean;
  rate: number;
  voice: string;
  play(messageId: string, content: string): void;
  pause(): void;
  resume(): void;
  stop(): void;
  toggle(messageId: string, content: string): void;
  setAutoRead(enabled: boolean): void;
}

export function createTtsStore(): TtsStore {
  let playingMessageId = $state<string | null>(null);
  let isPaused = $state(false);
  let rate = $state(1.0);
  let voiceName = $state('');
  let autoRead = $state(false);
  let chunks: string[] = [];
  let chunkIndex = 0;

  function getVoice(): SpeechSynthesisVoice | null {
    if (!SUPPORTED) return null;
    const voices = speechSynthesis.getVoices();
    if (voiceName) {
      return voices.find(v => v.name === voiceName) ?? voices[0] ?? null;
    }
    // Prefer a local English voice
    return voices.find(v => v.lang.startsWith(navigator.language) && v.localService)
      ?? voices.find(v => v.lang.startsWith('en') && v.localService)
      ?? voices[0]
      ?? null;
  }

  function speakChunk() {
    if (chunkIndex >= chunks.length) {
      playingMessageId = null;
      isPaused = false;
      return;
    }

    const utterance = new SpeechSynthesisUtterance(chunks[chunkIndex]);
    utterance.rate = rate;
    const voice = getVoice();
    if (voice) utterance.voice = voice;

    utterance.onend = () => {
      chunkIndex++;
      if (playingMessageId && !isPaused) {
        speakChunk();
      }
    };

    utterance.onerror = (event) => {
      if (event.error !== 'canceled' && event.error !== 'interrupted') {
        console.warn('[TTS] utterance error:', event.error);
      }
      playingMessageId = null;
      isPaused = false;
    };

    speechSynthesis.speak(utterance);
  }

  function play(messageId: string, content: string) {
    if (!SUPPORTED) return;

    // Stop any current playback
    speechSynthesis.cancel();

    const plainText = stripToPlainText(content);
    if (!plainText) return;

    chunks = splitIntoChunks(plainText);
    chunkIndex = 0;
    playingMessageId = messageId;
    isPaused = false;

    speakChunk();
  }

  function pause() {
    if (!SUPPORTED || !playingMessageId) return;
    speechSynthesis.pause();
    isPaused = true;
  }

  function resume() {
    if (!SUPPORTED || !playingMessageId) return;
    speechSynthesis.resume();
    isPaused = false;
  }

  function stop() {
    if (!SUPPORTED) return;
    speechSynthesis.cancel();
    playingMessageId = null;
    isPaused = false;
    chunks = [];
    chunkIndex = 0;
  }

  function toggle(messageId: string, content: string) {
    if (playingMessageId === messageId) {
      if (isPaused) {
        resume();
      } else {
        stop();
      }
    } else {
      play(messageId, content);
    }
  }

  return {
    get supported() { return SUPPORTED; },
    get playingMessageId() { return playingMessageId; },
    get isPaused() { return isPaused; },
    get isPlaying() { return !!playingMessageId && !isPaused; },
    get autoRead() { return autoRead; },

    get rate() { return rate; },
    set rate(v: number) { rate = Math.max(0.5, Math.min(2, v)); },

    get voice() { return voiceName; },
    set voice(v: string) { voiceName = v; },

    play,
    pause,
    resume,
    stop,
    toggle,

    setAutoRead(enabled: boolean) { autoRead = enabled; },
  };
}
