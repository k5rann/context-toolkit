"use client";

import * as React from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  Mic,
  MicOff,
  Copy,
  Download,
  AlertTriangle,
  Loader2,
  Clock,
  History,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  getSpeechRecognitionConstructor,
  isSpeechRecognitionSupported,
  describeSpeechError,
  LANGUAGES,
  type SpeechRecognitionInstance,
  type SpeechRecognitionEvent,
  type SpeechRecognitionErrorEvent,
} from "@/lib/voice-recognition";

type RecordingState = "idle" | "starting" | "recording";

// 3+ seconds between final results = paragraph break. Tuned for natural
// conversational pauses without splitting on every comma-length breath.
const PARAGRAPH_PAUSE_MS = 3000;

const STORAGE_CURRENT = "voice-current-transcript";
const STORAGE_SESSIONS = "voice-sessions";
const STORAGE_TIMESTAMPS = "voice-timestamps-enabled";
const HUMANIZER_HANDOFF_KEY = "humanizer-prefill-text";

interface VoiceSession {
  id: string;
  startedAt: number;
  endedAt: number;
  language: string;
  transcript: string;
  wordCount: number;
}

function formatTimestamp(elapsedMs: number): string {
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `[${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}]`;
}

function formatDate(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function VoicePage() {
  const router = useRouter();

  const [supported, setSupported] = React.useState<boolean | null>(null);
  const [isBrave, setIsBrave] = React.useState(false);
  const [state, setState] = React.useState<RecordingState>("idle");
  const [transcript, setTranscript] = React.useState("");
  const [interim, setInterim] = React.useState("");
  const [language, setLanguage] = React.useState("en-US");
  const [error, setError] = React.useState<string | null>(null);
  const [timestampsEnabled, setTimestampsEnabled] = React.useState(false);
  const [sessions, setSessions] = React.useState<VoiceSession[]>([]);
  const [showHistory, setShowHistory] = React.useState(false);

  const recognitionRef = React.useRef<SpeechRecognitionInstance | null>(null);
  const userStoppedRef = React.useRef(false);
  const lastFinalAtRef = React.useRef<number>(0);
  const recordingStartedAtRef = React.useRef<number>(0);

  // Hydration: detect browser support, load Brave flag, restore autosaved
  // transcript and sessions from localStorage.
  React.useEffect(() => {
    const id = window.setTimeout(() => {
      setSupported(isSpeechRecognitionSupported());
      const nav = navigator as Navigator & {
        brave?: { isBrave: () => Promise<boolean> };
      };
      nav.brave?.isBrave().then((result) => setIsBrave(result)).catch(() => {});

      // Restore prior session that was autosaved (e.g. after a refresh)
      try {
        const saved = localStorage.getItem(STORAGE_CURRENT);
        if (saved) setTranscript(saved);
        const sessionList = localStorage.getItem(STORAGE_SESSIONS);
        if (sessionList) setSessions(JSON.parse(sessionList));
        const ts = localStorage.getItem(STORAGE_TIMESTAMPS);
        if (ts === "true") setTimestampsEnabled(true);
      } catch {
        // localStorage can throw in private mode; ignore
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  // Autosave transcript to localStorage on every change (debounced via React batching).
  React.useEffect(() => {
    if (supported === null) return; // wait for hydration
    try {
      if (transcript) {
        localStorage.setItem(STORAGE_CURRENT, transcript);
      } else {
        localStorage.removeItem(STORAGE_CURRENT);
      }
    } catch {}
  }, [transcript, supported]);

  // Persist sessions list whenever it changes.
  React.useEffect(() => {
    if (supported === null) return;
    try {
      localStorage.setItem(STORAGE_SESSIONS, JSON.stringify(sessions));
    } catch {}
  }, [sessions, supported]);

  // Persist timestamps preference.
  React.useEffect(() => {
    if (supported === null) return;
    try {
      localStorage.setItem(STORAGE_TIMESTAMPS, timestampsEnabled ? "true" : "false");
    } catch {}
  }, [timestampsEnabled, supported]);

  // Cleanup on unmount.
  React.useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        userStoppedRef.current = true;
        try {
          recognitionRef.current.abort();
        } catch {}
      }
    };
  }, []);

  // Keyboard shortcut: Space toggles recording. Skip when focused inside an
  // input/textarea/contenteditable to avoid stealing typing.
  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code !== "Space") return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) return;
      e.preventDefault();
      if (state === "recording") {
        stopRecording();
      } else if (state === "idle") {
        startRecording();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, language, timestampsEnabled]);

  function appendFinalChunk(rawText: string) {
    const text = rawText.trim();
    if (!text) return;

    const now = Date.now();
    const sincePrev = now - lastFinalAtRef.current;
    const isLongPause = lastFinalAtRef.current > 0 && sincePrev > PARAGRAPH_PAUSE_MS;
    lastFinalAtRef.current = now;

    setTranscript((prev) => {
      if (!prev) {
        // First chunk of the session
        if (timestampsEnabled) {
          const elapsed = now - recordingStartedAtRef.current;
          return `${formatTimestamp(elapsed)} ${text}`;
        }
        return text;
      }
      if (isLongPause) {
        const prefix = timestampsEnabled
          ? `\n\n${formatTimestamp(now - recordingStartedAtRef.current)} `
          : "\n\n";
        return `${prev.trimEnd()}${prefix}${text}`;
      }
      // Same paragraph — just append with space
      return `${prev.trimEnd()} ${text}`;
    });
  }

  function startRecording() {
    const Ctor = getSpeechRecognitionConstructor();
    if (!Ctor) {
      setError(
        "Voice recognition isn't supported in this browser. Use Chrome, Safari, or Edge."
      );
      return;
    }

    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = language;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      setState("recording");
      setError(null);
      if (recordingStartedAtRef.current === 0) {
        recordingStartedAtRef.current = Date.now();
      }
    };

    rec.onresult = (event: SpeechRecognitionEvent) => {
      let finalChunk = "";
      let interimChunk = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript;
        if (result.isFinal) {
          finalChunk += text;
        } else {
          interimChunk += text;
        }
      }
      if (finalChunk) {
        appendFinalChunk(finalChunk);
      }
      setInterim(interimChunk);
    };

    rec.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === "aborted" && userStoppedRef.current) return;
      if (event.error === "no-speech") return;
      setError(describeSpeechError(event.error));
      setState("idle");
    };

    rec.onend = () => {
      if (!userStoppedRef.current && state === "recording") {
        try {
          rec.start();
          return;
        } catch {}
      }
      setState("idle");
      setInterim("");
    };

    recognitionRef.current = rec;
    userStoppedRef.current = false;
    lastFinalAtRef.current = 0;
    if (!transcript) {
      // Fresh session — reset start time so timestamps begin at 00:00
      recordingStartedAtRef.current = Date.now();
    } else if (recordingStartedAtRef.current === 0) {
      recordingStartedAtRef.current = Date.now();
    }
    setState("starting");
    try {
      rec.start();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Could not start: ${message}`);
      setState("idle");
    }
  }

  function stopRecording() {
    userStoppedRef.current = true;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }
  }

  function saveCurrentToHistory() {
    if (!transcript.trim()) {
      toast.error("Nothing to save yet");
      return;
    }
    const session: VoiceSession = {
      id: crypto.randomUUID(),
      startedAt: recordingStartedAtRef.current || Date.now(),
      endedAt: Date.now(),
      language,
      transcript,
      wordCount: transcript.split(/\s+/).filter(Boolean).length,
    };
    setSessions((prev) => [session, ...prev].slice(0, 30));
    toast.success("Saved to history");
  }

  function loadSession(session: VoiceSession) {
    if (state === "recording") {
      toast.error("Stop recording first");
      return;
    }
    setTranscript(session.transcript);
    setInterim("");
    setLanguage(session.language);
    setShowHistory(false);
    toast.success("Loaded session");
  }

  function deleteSession(id: string) {
    setSessions((prev) => prev.filter((s) => s.id !== id));
  }

  async function copyTranscript() {
    if (!transcript) return;
    await navigator.clipboard.writeText(transcript);
    toast.success("Copied to clipboard");
  }

  function downloadTranscript() {
    if (!transcript) return;
    const blob = new Blob([transcript], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transcript-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function sendToHumanizer() {
    if (!transcript.trim()) {
      toast.error("Transcribe something first");
      return;
    }
    try {
      sessionStorage.setItem(HUMANIZER_HANDOFF_KEY, transcript);
      router.push("/humanizer");
    } catch {
      toast.error("Could not pass transcript to Humanizer");
    }
  }

  function clearAll() {
    if (state === "recording") stopRecording();
    setTranscript("");
    setInterim("");
    setError(null);
    recordingStartedAtRef.current = 0;
    lastFinalAtRef.current = 0;
  }

  // ===== Render =====

  if (supported === null) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Voice to Text
          </h1>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!supported) {
    return (
      <div className="space-y-8 max-w-2xl">
        <div className="space-y-2">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Voice to Text
          </h1>
          <p className="text-muted-foreground">
            Speak. See it transcribed live. Browser-native — no API costs, no
            rate limits.
          </p>
        </div>
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-6 flex gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="space-y-2 text-sm">
              <div className="font-semibold text-foreground">
                Your browser doesn&apos;t support voice recognition
              </div>
              <p className="text-muted-foreground leading-relaxed">
                The Web Speech API is supported in Chrome, Safari, Edge, and
                Brave. Firefox doesn&apos;t support it. Open this page in one of
                those browsers and try again.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isRecording = state === "recording";
  const isStarting = state === "starting";

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="space-y-2">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
          Voice to Text
        </h1>
        <p className="text-muted-foreground">
          Speak. See it transcribed live. Tap{" "}
          <kbd className="px-1.5 py-0.5 rounded border border-border/60 bg-muted/30 font-mono text-xs">
            Space
          </kbd>{" "}
          to start or stop. Long pauses break paragraphs automatically.
        </p>
      </div>

      {/* Controls row: language + options */}
      <div className="space-y-3">
        <h2 className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
          Language
        </h2>
        <div className="flex flex-wrap gap-2">
          {LANGUAGES.map((lang) => {
            const active = language === lang.code;
            return (
              <button
                key={lang.code}
                onClick={() => setLanguage(lang.code)}
                disabled={isRecording || isStarting}
                className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border/60 bg-muted/10 hover:border-border hover:bg-muted/30 text-muted-foreground"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {lang.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={timestampsEnabled}
            onChange={(e) => setTimestampsEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-border accent-primary"
          />
          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          <span>Timestamps on paragraph breaks</span>
        </label>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowHistory((v) => !v)}
          className="gap-1.5"
        >
          <History className="h-4 w-4" />
          History ({sessions.length})
        </Button>
      </div>

      {/* History panel */}
      {showHistory && (
        <Card className="border-border/60">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Saved sessions</h3>
              {sessions.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (confirm("Delete all saved sessions?")) setSessions([]);
                  }}
                  className="h-7 text-xs text-muted-foreground"
                >
                  Clear all
                </Button>
              )}
            </div>
            {sessions.length === 0 ? (
              <div className="text-sm text-muted-foreground py-4 text-center">
                No saved sessions yet. Press &quot;Save to history&quot; below
                to keep a transcript.
              </div>
            ) : (
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {sessions.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/30 transition-colors group"
                  >
                    <button
                      onClick={() => loadSession(s)}
                      className="flex-1 min-w-0 text-left"
                    >
                      <div className="text-sm truncate">
                        {s.transcript.slice(0, 80) || "(empty)"}
                        {s.transcript.length > 80 ? "..." : ""}
                      </div>
                      <div className="text-xs text-muted-foreground font-mono mt-0.5">
                        {formatDate(s.endedAt)} · {s.wordCount} words ·{" "}
                        {s.language}
                      </div>
                    </button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteSession(s.id)}
                      className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label="Delete session"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Mic button + status */}
      <div className="flex flex-col items-center justify-center gap-4 py-4">
        <button
          onClick={isRecording ? stopRecording : startRecording}
          disabled={isStarting}
          className={`relative h-24 w-24 rounded-full flex items-center justify-center transition-all duration-200 ${
            isRecording
              ? "bg-red-500/15 ring-2 ring-red-500 hover:bg-red-500/25"
              : "bg-primary/10 ring-1 ring-border/60 hover:bg-primary/20 hover:ring-primary/40"
          } disabled:opacity-60 disabled:cursor-not-allowed`}
          aria-label={isRecording ? "Stop recording" : "Start recording"}
        >
          {isStarting ? (
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          ) : isRecording ? (
            <MicOff className="h-8 w-8 text-red-500" />
          ) : (
            <Mic className="h-8 w-8 text-primary" />
          )}
          {isRecording && (
            <span className="absolute inset-0 rounded-full ring-4 ring-red-500/30 animate-ping" />
          )}
        </button>
        <div className="text-sm font-medium text-center">
          {isStarting && "Requesting mic..."}
          {isRecording && (
            <span className="text-red-500 flex items-center gap-2 justify-center">
              <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
              Recording — tap or press Space to stop
            </span>
          )}
          {state === "idle" && (
            <span className="text-muted-foreground">
              Tap the mic or press Space to start
            </span>
          )}
        </div>
      </div>

      {/* Brave warning */}
      {isBrave && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4 flex gap-3 text-sm">
            <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-semibold text-foreground">
                Brave detected
              </div>
              <p className="text-muted-foreground leading-relaxed">
                Brave blocks Google&apos;s speech service even with Shields
                down. If you get a network error, switch to{" "}
                <strong>Safari</strong> (on-device, no Google) or{" "}
                <strong>Chrome / Edge</strong>.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {error && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-4 flex gap-3 text-sm">
            <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
            <div>{error}</div>
          </CardContent>
        </Card>
      )}

      {/* Transcript */}
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <label className="text-sm font-medium">Transcript</label>
          <div className="flex gap-1 flex-wrap">
            <Button
              variant="ghost"
              size="sm"
              onClick={saveCurrentToHistory}
              disabled={!transcript || isRecording}
              className="h-7 gap-1.5 text-xs"
            >
              <History className="h-3 w-3" />
              Save to history
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={sendToHumanizer}
              disabled={!transcript || isRecording}
              className="h-7 gap-1.5 text-xs"
            >
              <Sparkles className="h-3 w-3" />
              Send to Humanizer
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={copyTranscript}
              disabled={!transcript}
              className="h-7 gap-1.5 text-xs"
            >
              <Copy className="h-3 w-3" />
              Copy
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={downloadTranscript}
              disabled={!transcript}
              className="h-7 gap-1.5 text-xs"
            >
              <Download className="h-3 w-3" />
              Download
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAll}
              disabled={!transcript && !interim && !error}
              className="h-7 text-xs text-muted-foreground"
            >
              Clear
            </Button>
          </div>
        </div>

        <div className="relative">
          <Textarea
            value={transcript + (interim ? " " + interim : "")}
            onChange={(e) => {
              setTranscript(e.target.value);
              setInterim("");
            }}
            placeholder={
              isRecording
                ? "Listening..."
                : "Tap the mic above or press Space to start speaking. Your words will appear here in real time."
            }
            rows={14}
            className="resize-y font-sans text-base leading-relaxed"
          />
          {interim && (
            <div className="absolute bottom-2 right-3 text-[10px] font-mono text-muted-foreground italic pointer-events-none">
              live
            </div>
          )}
        </div>

        <div className="text-xs text-muted-foreground font-mono text-right">
          {transcript.split(/\s+/).filter(Boolean).length} words ·{" "}
          {transcript.length} chars
        </div>
      </div>

      <Separator />

      {/* Tips */}
      <div className="rounded-xl border border-border/40 bg-muted/10 p-4 space-y-2 text-sm text-muted-foreground">
        <div className="font-semibold text-foreground text-xs tracking-widest uppercase">
          Tips
        </div>
        <ul className="space-y-1.5 leading-relaxed">
          <li>
            • Press{" "}
            <kbd className="px-1 py-0.5 rounded border border-border/60 bg-muted/30 font-mono text-[10px]">
              Space
            </kbd>{" "}
            to start or stop without clicking. Ignored when typing in text
            fields.
          </li>
          <li>
            • Pauses longer than 3 seconds create a new paragraph
            automatically. Useful for long meetings.
          </li>
          <li>
            • Toggle <strong>Timestamps</strong> to mark each paragraph with{" "}
            <code className="text-xs font-mono">[mm:ss]</code> from the start
            of the session.
          </li>
          <li>
            • Transcripts autosave to your browser. Click{" "}
            <strong>Save to history</strong> to keep a snapshot you can revisit.
          </li>
          <li>
            • Use <strong>Send to Humanizer</strong> to drop the transcript
            into the Humanizer for cleaning up the spoken-language quirks.
          </li>
          <li>
            • On Safari, audio processes on-device. On Chrome/Edge it goes
            through Google&apos;s speech service. Brave blocks that by default.
          </li>
        </ul>
      </div>
    </div>
  );
}
