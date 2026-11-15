// Web Speech is not yet included in TypeScript's standard DOM definitions.
export type SpeechResultEvent = Event & { resultIndex: number; results: { length: number; [index: number]: { isFinal: boolean; [index: number]: { transcript: string } } } };
export type SpeechErrorEvent = Event & { error: string };
export interface BrowserRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
export type RecognitionConstructor = new () => BrowserRecognition;
type SpeechWindow = Window & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };

/** Reconocimiento de voz del navegador (Chrome, Edge); undefined en Firefox. */
export const Reconocimiento: RecognitionConstructor | undefined =
  (window as SpeechWindow).SpeechRecognition ?? (window as SpeechWindow).webkitSpeechRecognition;

/** Errores del reconocimiento de voz, en el texto que ve el usuario. */
export const ERRORES_VOZ: Record<string, string> = {
  'not-allowed': 'Microphone permission denied. Allow it in browser settings to use voice input.',
  'service-not-allowed': 'Speech recognition is blocked in this browser.',
  'audio-capture': 'No microphone found. Check your microphone and try again.',
  'no-speech': 'No speech detected. Try again.',
  'network': 'Speech recognition needs a network connection. You can type instead.',
};
