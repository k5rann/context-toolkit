"use client";

/**
 * Clean humanizer UI — stealthwriter-style layout.
 * - Level 1-10 slider (mapped to existing model presets + passes)
 * - Model picker (chain / minimax / minimax-deep)
 * - Word count + <100-word warning
 * - Humanize + Check for AI buttons
 * - Right-side detector panel (GPTZero proxy, stub for now)
 *
 * Backend: reuses existing /api/humanize endpoint.
 */

import * as React from "react";
import { toast } from "sonner";
import {
  Wand2,
  Gauge,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { HumanizerModelPreset } from "@/lib/prompts/humanizer-template";

interface SentenceAlternative {
  sentence: string;
  rank: number;
}

interface SentenceEntry {
  id: number;
  original: string;
  alternatives: SentenceAlternative[];
}

interface AlternativesResult {
  sentences: SentenceEntry[];
  composedOutput: string;
  anchorUsed: string;
  model: string;
  tooShort?: boolean;
}

// ── Level → model + passes mapping ───────────────────────────────────────
// Levels 1-3: light touch (single chain pass, conservative)
// Levels 4-6: medium (chain pass + reference styling)
// Levels 7-8: heavy (chain-strict, multiple passes)
// Levels 9-10: maximum (chain-strict + extra rewrite + experimental burstiness)
type LevelConfig = {
  level: number;
  preset: HumanizerModelPreset;
  label: string;
  description: string;
};

const LEVELS: LevelConfig[] = [
  { level: 1, preset: "minimax-deep", label: "Subtle polish", description: "Light pass, mostly grammar + flow" },
  { level: 2, preset: "minimax-deep", label: "Light edit", description: "Conservative wording changes" },
  { level: 3, preset: "minimax-deep", label: "Medium edit", description: "Phrase-level rewrites" },
  { level: 4, preset: "chain", label: "Stronger edit", description: "Restructured sentences" },
  { level: 5, preset: "chain", label: "Balanced rewrite", description: "Full chain pass, balanced" },
  { level: 6, preset: "chain", label: "Full rewrite", description: "Multi-stage rewriting" },
  { level: 7, preset: "chain-strict", label: "Heavy rewrite", description: "Strict chain, aggressive variation" },
  { level: 8, preset: "chain-strict", label: "Heavy rewrite with maximum variation", description: "Strict chain, maximum variation" },
  { level: 9, preset: "chain-strict", label: "Maximum aggression", description: "Strict chain + extra polish" },
  { level: 10, preset: "chain-strict", label: "Experimental", description: "Strict chain + burstiness injection (experimental)" },
];

// Three Veil tiers — collapsed from previous 4-way Ghost picker.
// Each tier maps to a backend modelPreset internally.
const MODELS: { id: HumanizerModelPreset; name: string; tier: string }[] = [
  { id: "minimax-deep", name: "Veil Lite", tier: "Fast, single model" },
  { id: "chain", name: "Veil Pro", tier: "Two-model chain, balanced" },
  { id: "chain-strict", name: "Veil Max", tier: "Two-model chain, no fact loss" },
  { id: "stealth", name: "Stealth", tier: "Style-anchor, Copyleaks-tested" },
];

const MAX_CHARS = 25000;
const WORD_WARN_THRESHOLD = 100;

function SentenceSpan({
  entry,
  selectedIndex,
  onCycle,
  isOriginal,
}: {
  entry: SentenceEntry;
  selectedIndex: number;
  onCycle: () => void;
  isOriginal: boolean;
}) {
  const current = entry.alternatives[selectedIndex];
  const hasAlts = entry.alternatives.length > 1;
  const altCount = entry.alternatives.length;

  return (
    <span
      role={hasAlts ? "button" : undefined}
      tabIndex={hasAlts ? 0 : undefined}
      onClick={onCycle}
      onKeyDown={(e) => {
        if (hasAlts && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onCycle();
        }
      }}
      title={
        hasAlts
          ? `Alternative ${selectedIndex + 1}/${altCount} — click to swap`
          : undefined
      }
      className={[
        "inline",
        hasAlts && "cursor-pointer rounded-sm transition-colors",
        hasAlts &&
          (isOriginal
            ? "bg-amber-100/60 hover:bg-amber-200/80 dark:bg-amber-900/30 dark:hover:bg-amber-800/40"
            : "bg-emerald-100/60 hover:bg-emerald-200/80 dark:bg-emerald-900/30 dark:hover:bg-emerald-800/40"),
        hasAlts && "underline decoration-dotted decoration-1 underline-offset-2",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {current?.sentence ?? entry.original}{" "}
    </span>
  );
}

interface DetectorScore {
  aiPct: number;
  humanPct: number;
  verdict: "human" | "mixed" | "ai";
  detector: string;
}

export function HumanizerCleanPage() {
  const [text, setText] = React.useState("");
  const [output, setOutput] = React.useState("");
  const [level, setLevel] = React.useState(8);
  const [modelOverride, setModelOverride] =
    React.useState<HumanizerModelPreset | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [detectorLoading, setDetectorLoading] = React.useState(false);
  const [detector, setDetector] = React.useState<DetectorScore | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [alternatives, setAlternatives] =
    React.useState<AlternativesResult | null>(null);
  const [selectedAlts, setSelectedAlts] = React.useState<
    Record<number, number>
  >({});
  /** True once the user has manually clicked any alternative */
  const [altsTouched, setAltsTouched] = React.useState(false);

  const wordCount = React.useMemo(() => {
    const t = text.trim();
    if (!t) return 0;
    return t.split(/\s+/).length;
  }, [text]);

  const currentLevel = LEVELS[level - 1];
  const activePreset = modelOverride ?? currentLevel.preset;

  async function handleHumanize() {
    if (!text.trim()) {
      toast.error("Paste some text first");
      return;
    }
    setLoading(true);
    setError(null);
    setOutput("");
    setDetector(null);
    setAlternatives(null);
    setSelectedAlts({});
    setAltsTouched(false);

    const useStealth = activePreset === "stealth";

    try {
      if (useStealth) {
        const res = await fetch("/api/humanize-alternatives", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        setAlternatives(data);
        setOutput(data.composedOutput ?? "");
        toast.success("Humanized with alternatives");
      } else {
        const res = await fetch("/api/humanize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text,
            modelPreset: activePreset,
            contentMode: "auto",
            referenceStyle: "direct",
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        setOutput(data.output ?? "");
        toast.success("Humanized");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Humanize failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  const composedFromAlts = React.useMemo(() => {
    if (!alternatives) return "";
    return alternatives.sentences
      .map((s) => {
        const idx = selectedAlts[s.id] ?? 0;
        return s.alternatives[idx]?.sentence ?? s.original;
      })
      .join(" ");
  }, [alternatives, selectedAlts]);

  // Only override output with raw alt-join when the user has clicked alternatives.
  // Otherwise keep the post-processed composedOutput from the server.
  React.useEffect(() => {
    if (composedFromAlts && altsTouched) {
      setOutput(composedFromAlts);
    }
  }, [composedFromAlts, altsTouched]);

  async function handleDetect() {
    const target = output || text;
    if (!target.trim()) {
      toast.error("Nothing to scan — humanize first or paste text");
      return;
    }
    setDetectorLoading(true);
    setDetector(null);
    try {
      const res = await fetch("/api/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: target }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setDetector(data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Detection failed";
      toast.error(msg);
    } finally {
      setDetectorLoading(false);
    }
  }

  function copyOutput() {
    if (!output) return;
    navigator.clipboard.writeText(output);
    toast.success("Copied");
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Veil <span className="text-muted-foreground font-normal">— Humanizer</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            Paste AI-generated text. Humanize it. Check the score.
          </p>
        </div>
        <Badge variant="outline" className="text-xs">
          beta
        </Badge>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        {/* Left: input + controls + output */}
        <Card className="p-6">
          {/* Level slider */}
          <div className="mb-5">
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium">Level</label>
              <span className="text-xs text-muted-foreground">
                {currentLevel.label}
              </span>
            </div>
            <div className="flex items-center gap-3">
              {LEVELS.map((l) => (
                <button
                  key={l.level}
                  type="button"
                  onClick={() => setLevel(l.level)}
                  className={`h-8 w-8 rounded-md border text-xs font-medium transition ${
                    level === l.level
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-background text-muted-foreground hover:border-foreground/40"
                  }`}
                  aria-label={`Level ${l.level}: ${l.label}`}
                >
                  {l.level}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {currentLevel.description}
            </p>
          </div>

          <Separator className="my-5" />

          {/* Model picker */}
          <div className="mb-5">
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium">Model</label>
              {modelOverride && (
                <button
                  type="button"
                  onClick={() => setModelOverride(null)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  reset to level default
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {MODELS.map((m) => {
                const active = activePreset === m.id;
                const isLevelDefault =
                  !modelOverride && currentLevel.preset === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setModelOverride(m.id)}
                    className={`rounded-md border px-3 py-1.5 text-xs transition ${
                      active
                        ? "border-foreground bg-foreground text-background"
                        : "border-border bg-background hover:border-foreground/40"
                    }`}
                  >
                    <span className="font-medium">{m.name}</span>
                    <span className="ml-1.5 opacity-70">— {m.tier}</span>
                    {isLevelDefault && (
                      <span className="ml-1.5 text-[10px] opacity-60">
                        (auto)
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <Separator className="my-5" />

          {/* Input textarea */}
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
            placeholder="Paste your AI-generated text here…"
            className="min-h-[180px] resize-y font-mono text-sm"
          />
          <div className="mt-2 flex items-center justify-between text-xs">
            <span
              className={`${
                wordCount > 0 && wordCount < WORD_WARN_THRESHOLD
                  ? "text-amber-600"
                  : "text-muted-foreground"
              }`}
            >
              {wordCount} {wordCount === 1 ? "word" : "words"}
              {wordCount > 0 && wordCount < WORD_WARN_THRESHOLD && (
                <>
                  {" "}
                  <AlertTriangle className="inline h-3 w-3" /> Under{" "}
                  {WORD_WARN_THRESHOLD} — results may be inaccurate
                </>
              )}
            </span>
            <span className="text-muted-foreground">
              {text.length}/{MAX_CHARS}
            </span>
          </div>

          {/* Actions */}
          <div className="mt-4 flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDetect}
              disabled={detectorLoading || !text.trim()}
            >
              {detectorLoading ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Gauge className="mr-1.5 h-3.5 w-3.5" />
              )}
              Check for AI
            </Button>
            <Button
              size="sm"
              onClick={handleHumanize}
              disabled={loading || !text.trim()}
            >
              {loading ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Wand2 className="mr-1.5 h-3.5 w-3.5" />
              )}
              Humanize
            </Button>
          </div>

          {error && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-destructive">
              <XCircle className="h-3.5 w-3.5" />
              {error}
            </p>
          )}

          {/* Output */}
          {output && (
            <>
              <Separator className="my-5" />
              <div className="mb-2 flex items-center justify-between">
                <label className="text-sm font-medium">
                  Output
                  {alternatives && (
                    <span className="ml-2 text-[10px] font-normal text-muted-foreground">
                      click sentences to swap alternatives
                    </span>
                  )}
                </label>
                <button
                  type="button"
                  onClick={copyOutput}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Copy className="h-3 w-3" />
                  copy
                </button>
              </div>

              {alternatives?.tooShort && (
                <p className="mb-2 flex items-center gap-1.5 text-xs text-amber-600">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Output is under 350 characters. Copyleaks may not scan it. Try a longer input.
                </p>
              )}

              {alternatives ? (
                <div className="rounded-md border border-border bg-background p-4 text-sm leading-relaxed">
                  {alternatives.sentences.map((entry) => {
                    const selIdx = selectedAlts[entry.id] ?? 0;
                    const current = entry.alternatives[selIdx];
                    const hasAlts = entry.alternatives.length > 1;
                    return (
                      <SentenceSpan
                        key={entry.id}
                        entry={entry}
                        selectedIndex={selIdx}
                        onCycle={() => {
                          if (!hasAlts) return;
                          const next =
                            (selIdx + 1) % entry.alternatives.length;
                          setAltsTouched(true);
                          setSelectedAlts((prev) => ({
                            ...prev,
                            [entry.id]: next,
                          }));
                        }}
                        isOriginal={
                          current?.sentence === entry.original
                        }
                      />
                    );
                  })}
                </div>
              ) : (
                <Textarea
                  value={output}
                  readOnly
                  className="min-h-[180px] resize-y font-mono text-sm"
                />
              )}
            </>
          )}
        </Card>

        {/* Right: detector panel */}
        <Card className="p-6">
          <h2 className="mb-4 text-sm font-medium">Detection Score</h2>

          {!detector && !detectorLoading && (
            <div className="flex h-[180px] flex-col items-center justify-center text-center">
              <Gauge className="mb-2 h-8 w-8 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                Click "Check for AI" to scan
              </p>
            </div>
          )}

          {detectorLoading && (
            <div className="flex h-[180px] flex-col items-center justify-center">
              <Loader2 className="mb-2 h-6 w-6 animate-spin text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Scanning…</p>
            </div>
          )}

          {detector && (
            <div className="flex flex-col items-center">
              <div
                className={`flex h-32 w-32 items-center justify-center rounded-full border-4 ${
                  detector.verdict === "human"
                    ? "border-green-500"
                    : detector.verdict === "mixed"
                      ? "border-amber-500"
                      : "border-red-500"
                }`}
              >
                <div className="text-center">
                  <div className="text-2xl font-semibold">
                    {Math.round(detector.aiPct)}%
                  </div>
                  <div className="text-[10px] uppercase text-muted-foreground">
                    AI
                  </div>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-1.5">
                {detector.verdict === "human" && (
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                )}
                {detector.verdict !== "human" && (
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                )}
                <span className="text-sm font-medium capitalize">
                  {detector.verdict === "human"
                    ? "Looks Human"
                    : detector.verdict === "mixed"
                      ? "Mixed Signals"
                      : "Likely AI"}
                </span>
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {detector.detector}
              </p>
            </div>
          )}

          <Separator className="my-5" />
          <p className="text-[11px] text-muted-foreground">
            Detector is a free GPTZero proxy. Not the same fingerprint as
            Copyleaks. Use as iteration signal, validate with Copyleaks before
            shipping copy.
          </p>
          <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">
            Note: Topics related to AI (cybersecurity, machine learning, etc.)
            are not 100% guaranteed to pass detection due to topic-level
            fingerprinting by detectors.
          </p>
        </Card>
      </div>
    </div>
  );
}
