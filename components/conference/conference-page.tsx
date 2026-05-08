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
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  buildDeepgramUrl,
  colorForSpeaker,
  type DeepgramMessage,
  type DeepgramTranscriptMessage,
  type SpeakerTurn,
} from "@/lib/deepgram";
import { LANGUAGES } from "@/lib/voice-recognition";

type RecordingState = "idle" | "starting" | "recording" | "stopping";

// Group consecutive same-speaker words from a Deepgram message into either
// (a) an extension of the last turn (same speaker continues) or (b) a new
// turn (speaker changed). Returns the updated turns array.
function appendWords(
  turns: SpeakerTurn[],
  msg: DeepgramTranscriptMessage
): SpeakerTurn[] {
  const words = msg.channel.alternatives[0]?.words ?? [];
  if (words.length === 0) return turns;

  const next = [...turns];
  for (const w of words) {
    const speakerId = w.speaker ?? 0;
    const piece = w.punctuated_word ?? w.word;
    const last = next[next.length - 1];
    if (last && last.speakerId === speakerId) {
      last.text = `${last.text} ${piece}`;
      last.end = w.end;
    } else {
      next.push({
        id: `${msg.start}-${w.start}-${speakerId}`,
        speakerId,
        text: piece,
        start: w.start,
        end: w.end,
      });
    }
  }
  return next;
}

export function ConferencePage() {
  const [state, setState] = React.useState<RecordingState>("idle");
  const [turns, setTurns] = React.useState<SpeakerTurn[]>([]);
  const [interim, setInterim] = React.useState<{
    speakerId: number;
    text: string;
  } | null>(null);
  const [language, setLanguage] = React.useState("en-US");
  const [error, setError] = React.useState<string | null>(null);

  const wsRef = React.useRef<WebSocket | null>(null);
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const userStoppedRef = React.useRef(false);

  // Cleanup on unmount.
  React.useEffect(() => {
    return () => {
      userStoppedRef.current = true;
      cleanup();
    };
  }, []);

  function cleanup() {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      try {
        recorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    recorderRef.current = null;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        // ignore
      }
      wsRef.current = null;
    }
  }

  async function startRecording() {
    setError(null);
    setState("starting");
    userStoppedRef.current = false;

    try {
      // 1. Get a fresh token from our server route (key stays server-side).
      const tokenRes = await fetch("/api/deepgram/token", { method: "POST" });
      if (!tokenRes.ok) {
        const data = await tokenRes.json().catch(() => ({}));
        throw new Error(data.error || `Token endpoint returned ${tokenRes.status}`);
      }
      const { token } = (await tokenRes.json()) as { token: string };
      if (!token) throw new Error("Token endpoint returned empty token");

      // 2. Open the WebSocket to Deepgram. Browsers can't set Authorization
      // headers on WS, so Deepgram supports auth via Sec-WebSocket-Protocol.
      // Long-lived API keys: ["token", <key>]. Short-lived auth/grant
      // tokens are Bearer tokens, so they go in as ["bearer", <token>].
      const ws = new WebSocket(buildDeepgramUrl(language), ["bearer", token]);
      wsRef.current = ws;

      ws.onopen = async () => {
        // 3. Once Deepgram is ready, grab the mic and start streaming.
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          });
          streamRef.current = stream;

          const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
            ? "audio/webm;codecs=opus"
            : "audio/webm";
          const recorder = new MediaRecorder(stream, { mimeType });
          recorderRef.current = recorder;

          recorder.ondataavailable = (event) => {
            if (event.data.size > 0 && ws.readyState === WebSocket.OPEN) {
              ws.send(event.data);
            }
          };

          recorder.start(250); // emit a chunk every 250ms for low latency
          setState("recording");
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (message.toLowerCase().includes("permission")) {
            setError("Microphone access denied. Click the mic icon in your browser's address bar to allow it, then try again.");
          } else {
            setError(`Couldn't start mic: ${message}`);
          }
          cleanup();
          setState("idle");
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as DeepgramMessage;
          if (msg.type !== "Results") return;

          const alt = msg.channel.alternatives[0];
          if (!alt || !alt.transcript) {
            setInterim(null);
            return;
          }

          if (msg.is_final) {
            setTurns((prev) => appendWords(prev, msg));
            setInterim(null);
          } else {
            // Interim — show the live preview under the most recent speaker.
            const words = alt.words ?? [];
            const lastSpeaker = words[words.length - 1]?.speaker ?? 0;
            setInterim({ speakerId: lastSpeaker, text: alt.transcript });
          }
        } catch {
          // ignore non-JSON frames
        }
      };

      ws.onerror = () => {
        if (!userStoppedRef.current) {
          setError("Connection to Deepgram failed. Check your internet and try again.");
        }
      };

      ws.onclose = (event) => {
        // Code 1000 = clean close. Anything else after recording started
        // probably means the server closed on us (auth expired, network hiccup).
        if (!userStoppedRef.current && event.code !== 1000) {
          // Code 1006 specifically means abnormal close with no close frame —
          // usually an auth rejection. Give the user a more useful hint.
          if (event.code === 1006) {
            setError(
              "Connection rejected by Deepgram (1006). Most likely the API key doesn't have the required scopes. Make sure your Deepgram key has the Owner role."
            );
          } else {
            setError(
              `Connection dropped (code ${event.code}). ${event.reason || "Tap the mic to reconnect."}`
            );
          }
        }
        cleanup();
        setState("idle");
        setInterim(null);
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      cleanup();
      setState("idle");
    }
  }

  function stopRecording() {
    userStoppedRef.current = true;
    setState("stopping");
    cleanup();
    setState("idle");
    setInterim(null);
  }

  async function copyAll() {
    if (turns.length === 0) return;
    const text = turns
      .map((t) => `Speaker ${t.speakerId + 1}: ${t.text}`)
      .join("\n\n");
    await navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  }

  function downloadAll() {
    if (turns.length === 0) return;
    const text = turns
      .map((t) => `Speaker ${t.speakerId + 1}: ${t.text}`)
      .join("\n\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `conference-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function clearAll() {
    if (state === "recording") stopRecording();
    setTurns([]);
    setInterim(null);
    setError(null);
  }

  const isRecording = state === "recording";
  const isStarting = state === "starting";
  const isStopping = state === "stopping";

  const speakerSet = new Set(turns.map((t) => t.speakerId));
  const speakerCount = speakerSet.size;

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="space-y-2">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
          Conference Notes
        </h1>
        <p className="text-muted-foreground">
          Multi-speaker live transcription. Voices are auto-clustered as
          Speaker 1, Speaker 2, and so on — each with its own color. Powered
          by Deepgram&apos;s real-time diarization.
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
          disabled={isStarting || isStopping}
          className={`relative h-24 w-24 rounded-full flex items-center justify-center transition-all duration-200 ${
            isRecording
              ? "bg-red-500/15 ring-2 ring-red-500 hover:bg-red-500/25"
              : "bg-primary/10 ring-1 ring-border/60 hover:bg-primary/20 hover:ring-primary/40"
          } disabled:opacity-60 disabled:cursor-not-allowed`}
          aria-label={isRecording ? "Stop recording" : "Start recording"}
        >
          {isStarting || isStopping ? (
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
          {isStarting && "Connecting to Deepgram..."}
          {isStopping && "Stopping..."}
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
        {speakerCount > 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
            <Users className="h-3 w-3" />
            {speakerCount} {speakerCount === 1 ? "speaker" : "speakers"} detected
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-4 flex gap-3 text-sm">
            <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
            <div>{error}</div>
          </CardContent>
        </Card>
      )}

      {/* Transcript — speaker bubbles */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">Transcript</label>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={copyAll}
              disabled={turns.length === 0}
              className="h-7 gap-1.5 text-xs"
            >
              <Copy className="h-3 w-3" />
              Copy
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={downloadAll}
              disabled={turns.length === 0}
              className="h-7 gap-1.5 text-xs"
            >
              <Download className="h-3 w-3" />
              Download
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAll}
              disabled={turns.length === 0 && !interim && !error}
              className="h-7 text-xs text-muted-foreground"
            >
              Clear
            </Button>
          </div>
        </div>

        <div className="rounded-xl border border-border/40 bg-muted/5 p-4 min-h-[280px] space-y-3">
          {turns.length === 0 && !interim && (
            <div className="text-sm text-muted-foreground text-center py-12">
              {isRecording
                ? "Listening..."
                : "Tap the mic to start. Each speaker will appear in their own color."}
            </div>
          )}

          {turns.map((turn) => {
            const c = colorForSpeaker(turn.speakerId);
            return (
              <div
                key={turn.id}
                className={`rounded-lg border ring-1 ${c.bg} ${c.ring} border-transparent p-3 space-y-1`}
              >
                <div className={`text-xs font-semibold tracking-wide ${c.text}`}>
                  Speaker {turn.speakerId + 1}
                </div>
                <div className="text-sm leading-relaxed text-foreground">
                  {turn.text}
                </div>
              </div>
            );
          })}

          {interim && (
            <div
              className={`rounded-lg border border-dashed ${colorForSpeaker(interim.speakerId).bg} border-border/40 p-3 space-y-1 opacity-60`}
            >
              <div
                className={`text-xs font-semibold tracking-wide ${colorForSpeaker(interim.speakerId).text}`}
              >
                Speaker {interim.speakerId + 1} <span className="text-muted-foreground font-mono italic">live</span>
              </div>
              <div className="text-sm leading-relaxed italic text-muted-foreground">
                {interim.text}
              </div>
            </div>
          )}
        </div>

        {turns.length > 0 && (
          <div className="text-xs text-muted-foreground font-mono text-right">
            {turns.length} {turns.length === 1 ? "turn" : "turns"} ·{" "}
            {turns.reduce((sum, t) => sum + t.text.split(/\s+/).filter(Boolean).length, 0)}{" "}
            words
          </div>
        )}
      </div>

      <Separator />

      {/* Tips */}
      <div className="rounded-xl border border-border/40 bg-muted/10 p-4 space-y-2 text-sm text-muted-foreground">
        <div className="font-semibold text-foreground text-xs tracking-widest uppercase">
          Tips
        </div>
        <ul className="space-y-1.5 leading-relaxed">
          <li>
            • Diarization gets sharper after ~30 seconds of audio — voices
            need time to fingerprint. Early turns may merge or split until
            it locks in.
          </li>
          <li>
            • Place the mic in the middle of the table for in-person
            meetings. Two people sharing one mic confuses any diarizer.
          </li>
          <li>
            • Audio streams to Deepgram&apos;s servers in real time. If that&apos;s
            a privacy concern (e.g. confidential meetings), use Voice to
            Text on Safari instead — that one is fully on-device.
          </li>
          <li>
            • Costs ~$0.0048/min on the free credit. The $200 free tier =
            roughly 700 hours of recording.
          </li>
        </ul>
      </div>
    </div>
  );
}
