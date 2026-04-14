import type { SessionData } from '$lib/server/auth/guard';

declare global {
	namespace App {
		interface Locals {
			session: SessionData | null;
		}
	}

	// Web Speech API types (not included in TypeScript's DOM lib)
	interface SpeechRecognitionEvent extends Event {
		readonly resultIndex: number;
		readonly results: SpeechRecognitionResultList;
	}

	interface SpeechRecognitionResultList {
		readonly length: number;
		item(index: number): SpeechRecognitionResult;
		[index: number]: SpeechRecognitionResult;
	}

	interface SpeechRecognitionResult {
		readonly isFinal: boolean;
		readonly length: number;
		item(index: number): SpeechRecognitionAlternative;
		[index: number]: SpeechRecognitionAlternative;
	}

	interface SpeechRecognitionAlternative {
		readonly transcript: string;
		readonly confidence: number;
	}

	interface SpeechRecognitionErrorEvent extends Event {
		readonly error: string;
		readonly message: string;
	}

	interface SpeechRecognition extends EventTarget {
		continuous: boolean;
		interimResults: boolean;
		lang: string;
		onresult: ((event: SpeechRecognitionEvent) => void) | null;
		onend: (() => void) | null;
		onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
		start(): void;
		stop(): void;
		abort(): void;
	}

	interface SpeechRecognitionConstructor {
		new(): SpeechRecognition;
	}

	// eslint-disable-next-line no-var
	var SpeechRecognition: SpeechRecognitionConstructor | undefined;

	interface Window {
		SpeechRecognition?: SpeechRecognitionConstructor;
		webkitSpeechRecognition?: SpeechRecognitionConstructor;
	}
}

export {};
