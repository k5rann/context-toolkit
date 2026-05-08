"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  Mic,
  MicOff,
  Copy,
  Download,
  AlertTriangle,
  Loader2,
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

export function VoicePage() {
  const [supported, setSupported] = React.useState<boolean | null>(null);
  const [isBrave, setIsBrave] = React.useState(false);
  const [state, setState] = React.useState<RecordingState>("idle");
  const [transcript, setTranscript] = React.useState("");
  const [interim, setInterim] = React.useState("");
  const [language, setLanguage] = React.useState("en-US");
  const [error, setError] = React.useState<string | null>(null);

  const recognitionRef = React.useRef<SpeechRecognitionInstance | null>(null);
  const userStoppedRef = React.useRef(false);

  // Browser-support detection runs client-side after hydration.
  React.useEffect(() => {
    const id = window.setTimeout(() => {
      setSupported(isSpeechRecognitionSupported());
      // Brave exposes navigator.brave with an async isBrave() method.
      const nav = navigator as Navigator & { brave?: { isBrave: () => Promise<boolean> } };
      nav.brave?.isBrave().then((result) => setIsBrave(result)).catch(() => {});
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  // Cleanup on unmount.
  React.useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        userStoppedRef.current = true;
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore — abort can throw if already stopped
        }
      }
    };
  }, []);

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
        setTranscript((prev) =>
          prev ? `${prev.trimEnd()} ${finalChunk.trim()}` : finalChunk.trim()
        );
      }
      setInterim(interimChunk);
    };

    rec.onerror = (event: SpeechRecognitionErrorEvent) => {
      // "aborted" fires on a clean user-initiated stop; suppress the error UI.
      if (event.error === "aborted" && userStoppedRef.current) return;
      // "no-speech" is common in long sessions during pauses; auto-restart handles it.
      if (event.error === "no-speech") return;
      setError(describeSpeechError(event.error));
      setState("idle");
    };

    rec.onend = () => {
      // Web Speech sometimes auto-stops after long silence. If the user didn't
      // press Stop, restart so long sessions Just Work.
      if (!userStoppedRef.current && state === "recording") {
        try {
          rec.start();
          return;
        } catch {
          // fall through to clean-stop state below
        }
      }
      setState("idle");
      setInterim("");
    };

    recognitionRef.current = rec;
    userStoppedRef.current = false;
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
      } catch {
        // ignore
      }
    }
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

  function clearAll() {
    if (state === "recording") stopRecording();
    setTranscript("");
    setInterim("");
    setError(null);
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
          Speak. See it transcribed live. Browser-native Web Speech API — no
          API costs, no rate limits, no key needed. Edit the transcript
          inline; copy or download when done.
        </p>
      </div>

      {/* Language picker */}
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
              Recording — tap to stop
            </span>
          )}
          {state === "idle" && (
            <span className="text-muted-foreground">
              Tap the mic to start
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
              <div className="font-semibold text-foreground">Brave detected</div>
              <p className="text-muted-foreground leading-relaxed">
                Brave blocks Google&apos;s speech service even with Shields down. If you get a network error, switch to{" "}
                <strong>Safari</strong> (processes audio on-device, no Google) or{" "}
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
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">Transcript</label>
          <div className="flex gap-1">
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
              // Allow inline edits; clearing interim avoids the live word
              // bleeding back over the user's manual edits.
              setTranscript(e.target.value);
              setInterim("");
            }}
            placeholder={
              isRecording
                ? "Listening..."
                : "Tap the mic above and start speaking. Your words will appear here in real time."
            }
            rows={12}
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
          <li>• Web Speech adds basic punctuation; expect to clean it up.</li>
          <li>
            • For long sessions, the recording auto-restarts after silent
            gaps — keep talking, it&apos;ll keep transcribing.
          </li>
          <li>
            • The transcript is editable. Fix mistakes inline before copying.
          </li>
          <li>
            • On Safari, audio is processed on-device — nothing leaves your
            browser. On Chrome and Edge, it&apos;s sent to Google&apos;s speech servers.
            Brave blocks those servers by default.
          </li>
        </ul>
      </div>
    </div>
  );
}
