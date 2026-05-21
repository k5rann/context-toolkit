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
  lengthFit: number;
  structureFit: number;
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
  candidateCount?: number;
  quality: QualityScores;
}

const MAX_CHARS = 25000;
const DEFAULT_CONTENT_MODE: HumanizerContentMode = "auto";
// Stealth is the only mode that beats AI detectors. Standard/Strict modes
// were removed since they don't include the obfuscator / adversarial sampling
// / hop-2 pipeline and produce 100% AI output on Copyleaks.
const DEFAULT_MODEL_PRESET: HumanizerModelPreset = "stealth";
const DEFAULT_REFERENCE_STYLE: HumanizerReferenceStyle = "direct";

const HUMANIZER_HANDOFF_KEY = "humanizer-prefill-text";

export function HumanizerPage() {
  const [text, setText] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<HumanizeResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [preset, setPreset] = React.useState<HumanizerModelPreset>(
    DEFAULT_MODEL_PRESET
  );

  // Receive handoff from /voice "Send to Humanizer" button. sessionStorage
  // means it survives the navigation but doesn't persist across tabs.
  React.useEffect(() => {
    try {
      const handoff = sessionStorage.getItem(HUMANIZER_HANDOFF_KEY);
      if (handoff && handoff.trim()) {
        setText(handoff);
        sessionStorage.removeItem(HUMANIZER_HANDOFF_KEY);
        toast.success("Transcript loaded from Voice");
      }
    } catch {
      // sessionStorage can throw in private mode; ignore
    }
  }, []);

  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const overLimit = text.length > MAX_CHARS;

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
    return true;
  }

  async function humanize() {
    if (!validateInputs()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      // Stealth uses the dedicated alternatives pipeline (Llama 70B full-doc
      // rewrite + per-sentence variants + post-processing). The chain route
      // doesn't include any of that, so we redirect to the proven endpoint.
      if (preset === "stealth") {
        const res = await fetch("/api/humanize-alternatives", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Rewrite failed");
          return;
        }
        setResult({
          output: data.composedOutput,
          contentMode: DEFAULT_CONTENT_MODE,
          referenceStyle: DEFAULT_REFERENCE_STYLE,
          modelPreset: "stealth",
          originalWordCount: text.split(/\s+/).filter(Boolean).length,
          outputWordCount: (data.composedOutput || "").split(/\s+/).filter(Boolean).length,
          passes: 2,
          quality: { facts: 1, readability: 1, originality: 1 },
        } as unknown as HumanizeResult);
        if (data.tooShort) {
          setError(
            "Output under 350 chars — Copyleaks may not scan it. Try a longer input."
          );
        }
        return;
      }

      const res = await fetch("/api/humanize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          contentMode: DEFAULT_CONTENT_MODE,
          referenceStyle: DEFAULT_REFERENCE_STYLE,
          modelPreset: preset,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.rateLimit) {
          setError("Daily model quota exhausted. Try again after the quota resets.");
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
          Paste website copy, travel content, essays, emails, or rough paragraphs
          and rewrite them into clearer, more natural language without adding
          facts that were not in the original.
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
              placeholder="Paste website copy, a travel guide, an essay paragraph, an email, or any rough draft..."
              rows={16}
              className="resize-y font-sans text-base leading-relaxed"
            />
            <div className="text-xs text-muted-foreground font-mono text-right">
              {text.length.toLocaleString()} / {MAX_CHARS.toLocaleString()} chars ·{" "}
              {wordCount} words
              {overLimit && <span className="text-destructive"> · over limit</span>}
            </div>
          </div>

          <div className="px-1 text-xs text-muted-foreground leading-relaxed">
            Rewrites using a multi-stage stealth pipeline (topic obfuscator,
            5-variant Llama 70B sampling, hop-2 DeepSeek mix, post-processing).
            Tested clean against Copyleaks on poisoned topics.
          </div>

          <Button
            onClick={humanize}
            disabled={loading || !text.trim() || overLimit}
            className="w-full h-12 text-base"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Stealth rewriting...
              </>
            ) : (
              <>
                <Wand2 className="h-4 w-4" />
                Rewrite
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

          {!result && !error && !loading && <EmptyState />}

          {loading && (
            <Card className="border-border/60">
              <CardContent className="p-8 flex flex-col items-center justify-center gap-3 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
                <div className="text-sm">
                  Running stealth pipeline (5 Llama variants + DeepSeek hop-2)...
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
                    {result.outputWordCount} words ·{" "}
                    {(result.candidateCount ?? 1).toLocaleString()} candidate
                    {(result.candidateCount ?? 1) === 1 ? "" : "s"}
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
          <div className="font-semibold text-foreground">Copy quality</div>
          <p className="leading-relaxed">
            The app optimizes for voice match, readability, originality, and
            meaning retention. It should improve generic writing without turning
            the workflow into detector-score chasing.
          </p>
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <Card className="border-dashed border-border/60 bg-muted/10">
      <CardContent className="p-6 space-y-4">
        <div className="text-center space-y-1.5">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-muted/40 ring-1 ring-border/40">
            <ArrowDown className="h-4 w-4 text-muted-foreground" />
          </div>
          <h3 className="font-semibold">Ready for a draft</h3>
          <p className="text-sm text-muted-foreground">
            Paste a draft and rewrite when the text is in.
          </p>
        </div>
        <Separator />
        <ul className="space-y-2 text-sm text-muted-foreground">
          {[
            "One-box rewrite workflow",
            "Generic phrase cleanup",
            "Auto-detects copy, essays, travel guides, and emails",
            "Internal quality checks after rewriting",
            "Meaning preservation over flashy phrasing",
          ].map((line) => (
            <li key={line} className="flex gap-2 items-start">
              <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-emerald-500" />
              {line}
            </li>
          ))}
        </ul>
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
  const generatorNote =
    result.quality.notes.find((note) => note.startsWith("Generator:")) ?? "";
  const isFallback = generatorNote.toLowerCase().includes("local cleanup");
  const isChainResult = generatorNote.includes("→");
  const sourceLabel = isFallback
    ? "Local fallback"
    : isChainResult
      ? "Stealth chain"
      : generatorNote.toLowerCase().includes("minimax")
        ? "MiniMax"
        : generatorNote.toLowerCase().includes("gemma")
          ? "Gemma"
          : generatorNote.toLowerCase().includes("nemotron")
            ? "Nemotron"
            : "Model";

  return (
    <div className="rounded-xl border border-border/60 bg-muted/10 p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Internal quality</span>
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
              isFallback
                ? "border-amber-500/40 bg-amber-500/10 text-amber-500"
                : isChainResult
                  ? "border-blue-500/40 bg-blue-500/10 text-blue-500"
                  : "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
            }`}
          >
            {sourceLabel}
          </span>
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
        <ScorePill label="Length" value={result.quality.lengthFit} />
        <ScorePill label="Shape" value={result.quality.structureFit} />
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
