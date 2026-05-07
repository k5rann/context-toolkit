// Client + server helpers for Deepgram real-time diarization.
// Pattern: server mints a short-lived access token; browser opens a
// WebSocket directly to Deepgram with that token. Once the WS is open
// the token TTL no longer matters — the connection stays alive.

export interface DeepgramWord {
  word: string;
  punctuated_word?: string;
  start: number;
  end: number;
  speaker?: number;
  confidence: number;
}

export interface DeepgramAlternative {
  transcript: string;
  confidence: number;
  words: DeepgramWord[];
}

export interface DeepgramChannel {
  alternatives: DeepgramAlternative[];
}

export interface DeepgramTranscriptMessage {
  type: "Results";
  channel: DeepgramChannel;
  is_final: boolean;
  speech_final?: boolean;
  start: number;
  duration: number;
}

export interface DeepgramMetadataMessage {
  type: "Metadata";
}

export type DeepgramMessage =
  | DeepgramTranscriptMessage
  | DeepgramMetadataMessage;

// A speaker turn — contiguous run of words from one speaker.
// We accumulate these client-side; renaming a speaker rewrites the label
// for every turn matching that speakerId.
export interface SpeakerTurn {
  id: string;
  speakerId: number;
  text: string;
  start: number;
  end: number;
}

// Build the WebSocket URL for Deepgram listen endpoint.
// nova-3 is their flagship model with diarization. interim_results gives
// us live preview text; smart_format adds punctuation/casing.
export function buildDeepgramUrl(language: string): string {
  const params = new URLSearchParams({
    model: "nova-3",
    language,
    diarize: "true",
    interim_results: "true",
    smart_format: "true",
    punctuate: "true",
    encoding: "opus",
    channels: "1",
    sample_rate: "48000",
  });
  return `wss://api.deepgram.com/v1/listen?${params.toString()}`;
}

// 8 visually distinct color pairs for speaker bubbles. Cycles past 8.
// Tailwind classes — kept as static strings so the JIT picks them up.
export const SPEAKER_COLORS: { bg: string; ring: string; text: string }[] = [
  { bg: "bg-blue-500/10",    ring: "ring-blue-500/40",    text: "text-blue-400" },
  { bg: "bg-emerald-500/10", ring: "ring-emerald-500/40", text: "text-emerald-400" },
  { bg: "bg-amber-500/10",   ring: "ring-amber-500/40",   text: "text-amber-400" },
  { bg: "bg-purple-500/10",  ring: "ring-purple-500/40",  text: "text-purple-400" },
  { bg: "bg-pink-500/10",    ring: "ring-pink-500/40",    text: "text-pink-400" },
  { bg: "bg-cyan-500/10",    ring: "ring-cyan-500/40",    text: "text-cyan-400" },
  { bg: "bg-orange-500/10",  ring: "ring-orange-500/40",  text: "text-orange-400" },
  { bg: "bg-lime-500/10",    ring: "ring-lime-500/40",    text: "text-lime-400" },
];

export function colorForSpeaker(speakerId: number) {
  return SPEAKER_COLORS[speakerId % SPEAKER_COLORS.length];
}
