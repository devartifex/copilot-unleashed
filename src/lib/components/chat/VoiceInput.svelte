<script lang="ts">
  type VoiceState = 'idle' | 'listening';

  interface Props {
    onTranscript: (text: string) => void;
    onInterim?: (text: string) => void;
    disabled?: boolean;
    lang?: string;
  }

  const {
    onTranscript,
    onInterim,
    disabled = false,
    lang,
  }: Props = $props();

  const SpeechRecognitionCtor: SpeechRecognitionConstructor | undefined =
    typeof window !== 'undefined'
      ? (window.SpeechRecognition ?? window.webkitSpeechRecognition)
      : undefined;

  const supported = !!SpeechRecognitionCtor;

  let state = $state<VoiceState>('idle');
  let recognition: SpeechRecognition | null = null;

  function toggle() {
    if (state === 'listening') {
      stop();
    } else {
      start();
    }
  }

  function start() {
    if (!SpeechRecognitionCtor || disabled) return;

    recognition = new SpeechRecognitionCtor();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = lang ?? navigator.language;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcript;
        } else {
          interim += transcript;
        }
      }
      if (interim && onInterim) {
        onInterim(interim);
      }
      if (final) {
        onTranscript(final);
      }
    };

    recognition.onend = () => {
      state = 'idle';
      recognition = null;
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error !== 'aborted' && event.error !== 'no-speech') {
        console.warn('[VoiceInput] SpeechRecognition error:', event.error);
      }
      state = 'idle';
      recognition = null;
    };

    try {
      recognition.start();
      state = 'listening';
    } catch {
      state = 'idle';
      recognition = null;
    }
  }

  function stop() {
    if (recognition) {
      try { recognition.stop(); } catch { /* already stopped */ }
    }
    state = 'idle';
    recognition = null;
  }

  $effect(() => {
    return () => {
      if (recognition) {
        try { recognition.abort(); } catch { /* ignore */ }
        recognition = null;
      }
    };
  });
</script>

{#if supported}
  <button
    class="icon-btn mic-btn"
    class:listening={state === 'listening'}
    onclick={toggle}
    {disabled}
    aria-label={state === 'listening' ? 'Stop recording' : 'Start voice input'}
    aria-pressed={state === 'listening'}
  >
    {#if state === 'listening'}
      <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" aria-hidden="true">
        <rect x="4" y="4" width="10" height="10" rx="2" />
      </svg>
    {:else}
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="6" y="2" width="6" height="10" rx="3" />
        <path d="M3 9a6 6 0 0 0 12 0" />
        <line x1="9" y1="15" x2="9" y2="17" />
        <line x1="6" y1="17" x2="12" y2="17" />
      </svg>
    {/if}
  </button>
{/if}

<style>
  .mic-btn {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    border: none;
    background: transparent;
    color: var(--fg-muted);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: all 0.15s ease;
    -webkit-tap-highlight-color: transparent;
    position: relative;
  }

  .mic-btn:hover {
    background: var(--border);
    color: var(--fg);
  }

  .mic-btn:active {
    transform: scale(0.92);
    background: var(--border);
    color: var(--fg);
  }

  .mic-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .mic-btn.listening {
    color: var(--red, #ef4444);
    animation: micPulse 1.5s ease-in-out infinite;
  }

  .mic-btn.listening:hover {
    color: var(--red, #ef4444);
  }

  @keyframes micPulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.3); }
    50% { box-shadow: 0 0 0 6px rgba(239, 68, 68, 0); }
  }
</style>
