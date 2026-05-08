"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  Copy,
  Wand2,
  AlertTriangle,
  XCircle,
  Loader2,
  ArrowDown,
  CheckCircle2,
  Gauge,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useApiKey } from "@/components/api-key-provider";
import type {
  HumanizerContentMode,
  HumanizerModelPreset,
} from "@/lib/prompts/humanizer-template";
import type { HumanizerReferenceStyle } from "@/lib/humanizer-reference-library";

interface QualityScores {
  readability: number;
  repetition: number;
  genericPhrasing: number;
  sentenceVariety: number;
  specificity: number;
  meaningRetention: number;
  overall: number;
  notes: string[];
}

interface HumanizeResult {
  output: string;
  pass1Output?: string;
  contentMode: HumanizerContentMode;
  referenceStyle: HumanizerReferenceStyle;
  modelPreset: HumanizerModelPreset;
  originalWordCount: number;
  outputWordCount: number;
  passes: number;
  quality: QualityScores;
}

const MAX_CHARS = 25000;
const DEFAULT_CONTENT_MODE: HumanizerContentMode = "business";
const DEFAULT_MODEL_PRESET: HumanizerModelPreset = "fast";
const DEFAULT_REFERENCE_STYLE: HumanizerReferenceStyle = "business";

interface PresetChip {
  id: HumanizerModelPreset;
  label: string;
  hint: string;
  experimental?: boolean;
  experimentalNeedsServerKey?: boolean;
}

const PRESET_CHIPS: PresetChip[] = [
  { id: "fast", label: "Fast", hint: "Gemini Flash · 1 pass" },
  { id: "balanced", label: "Balanced", hint: "Gemini Flash · 2 passes" },
  { id: "quality", label: "Quality", hint: "Gemini Pro · 2 passes" },
  {
    id: "experimental-llama",
    label: "Llama-3.3-70B",
    hint: "OpenRouter · Meta · different fingerprint",
    experimental: true,
    experimentalNeedsServerKey: true,
  },
  {
    id: "experimental-qwen",
    label: "Qwen3-next-80B",
    hint: "OpenRouter · Alibaba · different fingerprint",
    experimental: true,
    experimentalNeedsServerKey: true,
  },
  {
    id: "experimental-minimax",
    label: "MiniMax-m2.5",
    hint: "OpenRouter · MiniMax · different fingerprint",
    experimental: true,
    experimentalNeedsServerKey: true,
  },
  {
    id: "adversarial",
    label: "Adversarial",
    hint: "5 Gemini candidates · scored vs detector · lowest wins · ~25s",
    experimental: true,
  },
  {
    id: "adversarial-minimax",
    label: "Adversarial-MiniMax",
    hint: "5 MiniMax candidates · scored vs detector · best shot at essay-shape Copyleaks wall · ~25s",
    experimental: true,
    experimentalNeedsServerKey: true,
  },
];

function isExperimentalPreset(preset: HumanizerModelPreset): boolean {
  return preset.startsWith("experimental-");
}

export function HumanizerPage() {
  const { userKey, hasSharedKey } = useApiKey();
  const [text, setText] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<HumanizeResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [preset, setPreset] = React.useState<HumanizerModelPreset>(
    DEFAULT_MODEL_PRESET
  );

  const hasKey = !!(userKey || hasSharedKey);
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const overLimit = text.length > MAX_CHARS;
  const usingExperimental = isExperimentalPreset(preset);
  const activeChip = PRESET_CHIPS.find((c) => c.id === preset);
  const showExperimentalBadge = !!activeChip?.experimental;

  function validateInputs() {
    if (!text.trim()) {
      toast.error("Paste a draft first");
      return false;
    }
    if (overLimit) {
      toast.error(
        `Input is ${text.length.toLocaleString()} chars; max ${MAX_CHARS.toLocaleString()}`
      );
      return false;
    }
    // Experimental presets route through the server's OpenRouter key — user
    // doesn't need their own Gemini key to use them.
    if (!usingExperimental && !hasKey) {
      toast.error("Add your Gemini key in the menu (top right)");
      return false;
    }
    return true;
  }

  async function humanize() {
    if (!validateInputs()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/humanize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          sourceNotes: "",
          writingSample: "",
          contentMode: DEFAULT_CONTENT_MODE,
          referenceStyle: DEFAULT_REFERENCE_STYLE,
          modelPreset: preset,
          apiKey: usingExperimental ? undefined : userKey || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.rateLimit) {
          setError(
            "Daily quota exhausted. Add your own free Gemini key in the menu (top right) for unlimited use."
          );
        } else {
          setError(data.error || "Rewrite failed");
        }
        return;
      }
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  async function copyOutput() {
    if (!result) return;
    await navigator.clipboard.writeText(result.output);
    toast.success("Copied to clipboard");
  }

  function pasteDraftFromClipboard() {
    navigator.clipboard
      .readText()
      .then((s) => {
        if (s) {
          setText(s);
          toast.success("Pasted draft");
        }
      })
      .catch(() => toast.error("Clipboard unavailable"));
  }

  function clearAll() {
    setText("");
    setResult(null);
    setError(null);
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
          Text Humanizer
        </h1>
        <p className="text-muted-foreground">
          Paste website copy and rewrite it into clearer, more specific company
          language without adding facts that were not in the original.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Draft to rewrite</label>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={pasteDraftFromClipboard}
                  className="h-7 text-xs"
                >
                  Paste
                </Button>
                {(text || result || error) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearAll}
                    className="h-7 text-xs text-muted-foreground"
                  >
                    Clear
                  </Button>
                )}
              </div>
            </div>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste website copy, service-page text, landing-page sections, or company content..."
              rows={16}
              className="resize-y font-sans text-base leading-relaxed"
            />
            <div className="text-xs text-muted-foreground font-mono text-right">
              {text.length.toLocaleString()} / {MAX_CHARS.toLocaleString()} chars ·{" "}
              {wordCount} words
              {overLimit && <span className="text-destructive"> · over limit</span>}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Model</label>
              {showExperimentalBadge && (
                <span className="text-[10px] font-mono text-amber-500 uppercase tracking-wider">
                  experimental
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {PRESET_CHIPS.map((chip) => {
                const active = preset === chip.id;
                return (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => setPreset(chip.id)}
                    disabled={loading}
                    title={chip.hint}
                    className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${
                      active
                        ? chip.experimental
                          ? "border-amber-500 bg-amber-500/10 text-amber-400"
                          : "border-primary bg-primary/10 text-primary"
                        : "border-border/60 bg-muted/10 hover:border-border hover:bg-muted/30 text-muted-foreground"
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {chip.label}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              {PRESET_CHIPS.find((c) => c.id === preset)?.hint}
              {usingExperimental && " · uses server's OpenRouter key, your Gemini key is ignored"}
            </p>
          </div>

          <Button
            onClick={humanize}
            disabled={
              loading ||
              !text.trim() ||
              overLimit
            }
            className="w-full h-12 text-base"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Rewriting...
              </>
            ) : (
              <>
                <Wand2 className="h-4 w-4" />
                Rewrite website copy
              </>
            )}
          </Button>
        </div>

        <div className="space-y-3">
          <label className="text-sm font-medium">Rewritten output</label>

          {error && (
            <Card className="border-destructive/40 bg-destructive/5">
              <CardContent className="p-4 flex gap-3">
                <XCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                <div className="text-sm">{error}</div>
              </CardContent>
            </Card>
          )}

          {!result && !error && !loading && <EmptyState hasKey={hasKey} />}

          {loading && (
            <Card className="border-border/60">
              <CardContent className="p-8 flex flex-col items-center justify-center gap-3 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
                <div className="text-sm">
                  Drafting a quick grounded rewrite...
                </div>
              </CardContent>
            </Card>
          )}

          {result && (
            <>
              <QualitySummary result={result} />

              <div className="rounded-xl border border-border/60 bg-muted/20 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2 border-b border-border/60 bg-muted/40">
                  <span className="text-xs font-mono text-muted-foreground">
                    {result.outputWordCount} words · {result.passes}-pass
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={copyOutput}
                    className="h-7 gap-1.5 text-xs"
                  >
                    <Copy className="h-3 w-3" />
                    Copy
                  </Button>
                </div>
                <div className="p-4 text-sm leading-relaxed whitespace-pre-wrap max-h-[600px] overflow-y-auto">
                  {result.output}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <Separator />

      <div className="rounded-xl border border-border/40 bg-muted/10 p-4 flex gap-3 text-sm">
        <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0 text-muted-foreground" />
        <div className="space-y-1 text-muted-foreground">
          <div className="font-semibold text-foreground">External checks</div>
          <p className="leading-relaxed">
            The app optimizes for voice match, readability, originality, and
            meaning retention. It should improve generic company copy without
            turning the workflow into detector-score chasing.
          </p>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ hasKey }: { hasKey: boolean }) {
  return (
    <Card className="border-dashed border-border/60 bg-muted/10">
      <CardContent className="p-6 space-y-4">
        <div className="text-center space-y-1.5">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-muted/40 ring-1 ring-border/40">
            <ArrowDown className="h-4 w-4 text-muted-foreground" />
          </div>
          <h3 className="font-semibold">Ready for a draft</h3>
          <p className="text-sm text-muted-foreground">
            Paste company website copy and rewrite when the draft is in.
          </p>
        </div>
        <Separator />
        <ul className="space-y-2 text-sm text-muted-foreground">
          {[
            "One-box website copy rewrite",
            "Generic phrase cleanup",
            "Company-friendly business voice",
            "Internal quality checks after rewriting",
            "Meaning preservation over flashy phrasing",
          ].map((line) => (
            <li key={line} className="flex gap-2 items-start">
              <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-emerald-500" />
              {line}
            </li>
          ))}
        </ul>
        {!hasKey && (
          <div className="flex gap-2 items-start text-xs text-amber-500 pt-2 border-t border-border/40">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            <span>
              No API key set yet. Open the menu (top right) to add one.
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function QualitySummary({ result }: { result: HumanizeResult }) {
  const delta = result.outputWordCount - result.originalWordCount;
  const pct =
    result.originalWordCount === 0
      ? 0
      : Math.round((delta / result.originalWordCount) * 100);
  const sign = delta >= 0 ? "+" : "";

  return (
    <div className="rounded-xl border border-border/60 bg-muted/10 p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Internal quality</span>
        </div>
        <span className="text-xs font-mono text-muted-foreground">
          {result.originalWordCount} {"->"} {result.outputWordCount} words ·{" "}
          {sign}
          {pct}%
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <ScorePill label="Overall" value={result.quality.overall} />
        <ScorePill label="Readability" value={result.quality.readability} />
        <ScorePill label="Repetition" value={result.quality.repetition} />
        <ScorePill label="Generic" value={result.quality.genericPhrasing} />
        <ScorePill label="Variety" value={result.quality.sentenceVariety} />
        <ScorePill label="Specific" value={result.quality.specificity} />
        <ScorePill label="Meaning" value={result.quality.meaningRetention} />
      </div>
      <Separator />
      <ul className="space-y-1.5 text-xs text-muted-foreground">
        {result.quality.notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </div>
  );
}

function ScorePill({ label, value }: { label: string; value: number }) {
  const color =
    value >= 85
      ? "text-emerald-500"
      : value >= 70
        ? "text-amber-500"
        : "text-destructive";

  return (
    <div className="rounded-lg border border-border/50 bg-background/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        {label}
      </div>
      <div className={`text-sm font-mono font-semibold ${color}`}>{value}</div>
    </div>
  );
}
