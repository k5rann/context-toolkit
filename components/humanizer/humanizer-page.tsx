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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useApiKey } from "@/components/api-key-provider";
import {
  TONES,
  type HumanizerTone,
} from "@/lib/prompts/humanizer-template";

interface HumanizeResult {
  output: string;
  pass1Output?: string;
  tone: HumanizerTone;
  originalWordCount: number;
  outputWordCount: number;
  passes?: number;
}

const MAX_CHARS = 25000;

export function HumanizerPage() {
  const { userKey, hasSharedKey } = useApiKey();
  const [text, setText] = React.useState("");
  const [tone, setTone] = React.useState<HumanizerTone>("casual");
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<HumanizeResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const hasKey = !!(userKey || hasSharedKey);
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const overLimit = text.length > MAX_CHARS;

  async function humanize() {
    if (!text.trim()) {
      toast.error("Paste some text first");
      return;
    }
    if (overLimit) {
      toast.error(
        `Input is ${text.length.toLocaleString()} chars; max ${MAX_CHARS.toLocaleString()}`
      );
      return;
    }
    if (!hasKey) {
      toast.error("Add your Gemini key in the menu (top right)");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/humanize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          tone,
          apiKey: userKey || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.rateLimit) {
          setError(
            "Daily quota exhausted. Add your own free Gemini key in the menu (top right) for unlimited use."
          );
        } else {
          setError(data.error || "Humanize failed");
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

  function pasteFromClipboard() {
    navigator.clipboard
      .readText()
      .then((s) => {
        if (s) {
          setText(s);
          toast.success("Pasted");
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
      {/* Hero */}
      <div className="space-y-2">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
          Text Humanizer
        </h1>
        <p className="text-muted-foreground">
          AI text in. Human-readable out. Two-pass rewrite — first a
          persona-led draft, then a critic pass that hunts surviving
          AI-shape signals (uniform burstiness, abstract nouns, conclusion
          shapes) and revises them out.
        </p>
      </div>

      {/* Tone chips */}
      <div className="space-y-3">
        <h2 className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
          Tone · pick one
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {TONES.map((t) => {
            const active = tone === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTone(t.id)}
                className={`text-left p-3 rounded-xl border transition-all ${
                  active
                    ? "border-primary bg-primary/5 shadow-md shadow-primary/10"
                    : "border-border/60 bg-muted/10 hover:border-border hover:bg-muted/30"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div
                    className={`h-2 w-2 rounded-full ${active ? "bg-primary" : "bg-muted-foreground/30"}`}
                  />
                  <div className="font-semibold text-sm">{t.label}</div>
                </div>
                <div className="text-xs text-muted-foreground leading-snug">
                  {t.short}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Input + Output */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">AI text to humanize</label>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={pasteFromClipboard}
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
            placeholder="Paste any AI-generated passage..."
            rows={12}
            className="resize-y font-sans text-base leading-relaxed"
          />
          <div className="text-xs text-muted-foreground font-mono text-right">
            {text.length.toLocaleString()} / {MAX_CHARS.toLocaleString()} chars · {wordCount} words
            {overLimit && (
              <span className="text-destructive"> · over limit</span>
            )}
          </div>

          <Button
            onClick={humanize}
            disabled={loading || !text.trim() || overLimit}
            className="w-full h-12 text-base"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Humanizing...
              </>
            ) : (
              <>
                <Wand2 className="h-4 w-4" />
                Humanize
              </>
            )}
          </Button>
        </div>

        {/* Output */}
        <div className="space-y-3">
          <label className="text-sm font-medium">Humanized output</label>

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
                  Two-pass rewrite in {tone} voice — drafting then revising...
                </div>
              </CardContent>
            </Card>
          )}

          {result && (
            <>
              <DiffStats result={result} />

              <div className="rounded-xl border border-border/60 bg-muted/20 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2 border-b border-border/60 bg-muted/40">
                  <span className="text-xs font-mono text-muted-foreground">
                    {result.tone} voice
                    {result.passes ? ` · ${result.passes}-pass` : ""} ·{" "}
                    {result.outputWordCount} words
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

      {/* Honest flag */}
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 flex gap-3 text-sm">
        <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0 text-amber-500" />
        <div className="space-y-1 text-muted-foreground">
          <div className="font-semibold text-foreground">
            About AI detector scores
          </div>
          <p className="leading-relaxed">
            Detectors (GPTZero, Turnitin AI, Copyleaks) update weekly. A
            rewrite that scores 95% human today might score 60% next month.
            Best for blog posts, LinkedIn, marketing copy, scripts. Using it
            on graded coursework is a risk you carry.
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
          <h3 className="font-semibold">Paste your text</h3>
          <p className="text-sm text-muted-foreground">
            Drop AI-generated copy in the box, pick a tone, hit Humanize.
          </p>
        </div>
        <Separator />
        <ul className="space-y-2 text-sm text-muted-foreground">
          {[
            "Pass 1: persona-led rewrite (varies burstiness + perplexity)",
            "Pass 2: critic hunts surviving AI shape, revises in place",
            "Strips AI-tells (delve, tapestry, moreover, etc.)",
            "Preserves facts, names, numbers, structure",
          ].map((line, i) => (
            <li key={i} className="flex gap-2 items-start">
              <span className="text-emerald-500 mt-0.5">✓</span>
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

function DiffStats({ result }: { result: HumanizeResult }) {
  const delta = result.outputWordCount - result.originalWordCount;
  const pct =
    result.originalWordCount === 0
      ? 0
      : Math.round((delta / result.originalWordCount) * 100);
  const sign = delta >= 0 ? "+" : "";

  return (
    <div className="rounded-xl border border-border/60 bg-muted/10 p-3 flex items-center justify-between text-xs font-mono">
      <span className="text-muted-foreground">
        {result.originalWordCount} → {result.outputWordCount} words
      </span>
      <span
        className={`${
          Math.abs(pct) <= 15
            ? "text-emerald-500"
            : Math.abs(pct) <= 25
              ? "text-amber-500"
              : "text-destructive"
        }`}
      >
        {sign}
        {delta} ({sign}
        {pct}%)
      </span>
    </div>
  );
}
