<script lang="ts">
  type VoiceState = 'idle' | 'listening';

  interface Props {
    onTranscript: (text: string) => void;
    onInterim?: (text: string) => void;
    onListeningChange?: (listening: boolean) => void;
    disabled?: boolean;
    lang?: string;
  }

  const {
    onTranscript,
    onInterim,
    onListeningChange,
    disabled = false,
    lang,
  }: Props = $props();

  const SpeechRecognitionCtor: SpeechRecognitionConstructor | undefined =
    typeof window !== 'undefined'
      ? (window.SpeechRecognition ?? window.webkitSpeechRecognition)
      : undefined;

  export const supported = !!SpeechRecognitionCtor;

  let state = $state<VoiceState>('idle');
  let recognition: SpeechRecognition | null = null;

  export function isListening(): boolean {
    return state === 'listening';
  }

  export function toggle() {
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
      onListeningChange?.(false);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error !== 'aborted' && event.error !== 'no-speech') {
        console.warn('[VoiceInput] SpeechRecognition error:', event.error);
      }
      state = 'idle';
      recognition = null;
      onListeningChange?.(false);
    };

    try {
      recognition.start();
      state = 'listening';
      onListeningChange?.(true);
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

<!-- No template — parent controls rendering via exported methods -->
