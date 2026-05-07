// Thin cross-browser wrapper around the Web Speech API.
// Web Speech is browser-native — no API key, no cost, no rate limit.
// Browser support: Chrome (full), Safari (full), Edge (full), Firefox (none).

// The Web Speech API's TypeScript definitions are not in lib.dom.d.ts in
// every TS version — declare the bits we use ourselves to stay portable.

export interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

export interface SpeechRecognitionResult {
  readonly length: number;
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternative;
}

export interface SpeechRecognitionResultList {
  readonly length: number;
  [index: number]: SpeechRecognitionResult;
}

export interface SpeechRecognitionEvent {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

export interface SpeechRecognitionErrorEvent {
  error: string;
  message?: string;
}

export interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionInstance;
}

interface BrowserGlobals {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}

export function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as BrowserGlobals;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognitionConstructor() !== null;
}

// Common BCP-47 language tags Web Speech accepts. List is curated to what
// Chrome/Safari actually support reliably, with Karanvir's likely use cases
// (English variants + Arabic for UAE) up top.
export interface VoiceLanguage {
  code: string;
  label: string;
}

export const LANGUAGES: VoiceLanguage[] = [
  { code: "en-US", label: "English (US)" },
  { code: "en-GB", label: "English (UK)" },
  { code: "en-IN", label: "English (India)" },
  { code: "ar-AE", label: "Arabic (UAE)" },
  { code: "ar-SA", label: "Arabic (Saudi)" },
  { code: "es-ES", label: "Spanish (Spain)" },
  { code: "es-MX", label: "Spanish (Mexico)" },
  { code: "fr-FR", label: "French (France)" },
  { code: "de-DE", label: "German" },
  { code: "hi-IN", label: "Hindi" },
  { code: "ur-PK", label: "Urdu" },
  { code: "pt-BR", label: "Portuguese (Brazil)" },
  { code: "ja-JP", label: "Japanese" },
  { code: "ko-KR", label: "Korean" },
  { code: "zh-CN", label: "Chinese (Mandarin)" },
];

// Translate the cryptic Web Speech error codes into something a user can act on.
export function describeSpeechError(code: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone access denied. Click the mic icon in your browser's address bar to allow it, then try again.";
    case "no-speech":
      return "Didn't hear anything. Try again — make sure your mic isn't muted.";
    case "audio-capture":
      return "No microphone found. Check that one is connected and selected as the default input.";
    case "network":
      return "Network error reaching the speech service. Brave blocks Google's speech servers by default — try switching to Safari (on-device, no Google needed) or Chrome/Edge with a normal network connection.";
    case "aborted":
      return "Recording stopped.";
    case "language-not-supported":
      return "This language isn't supported by your browser. Pick another.";
    default:
      return `Recording failed: ${code}`;
  }
}
