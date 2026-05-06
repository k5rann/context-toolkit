"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  Copy,
  Download,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { MODES, PRESETS, TEMPLATES } from "@/lib/catalogs";
import { useApiKey } from "@/components/api-key-provider";

interface BundleResult {
  output: string;
  raw_output: string;
  meta_prompt: string;
  attempts: number;
  history: Array<{
    attempt: number;
    violations: Array<{ matched: string; label: string }>;
    suspicious_refs: Array<{ matched: string; label: string }>;
    word_count: number;
  }>;
  violations: Array<{ matched: string; label: string }>;
  suspicious_refs: Array<{ matched: string; label: string }>;
  surgery_replacements: Array<{ original: string; replacement: string }>;
  refs_stripped: boolean;
  clean: boolean;
}

export function BundlerPage() {
  const { userKey, hasSharedKey } = useApiKey();
  const [userInput, setUserInput] = React.useState("");
  const [extra, setExtra] = React.useState("");
  const [selectedModes, setSelectedModes] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<BundleResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const hasKey = !!(userKey || hasSharedKey);
  const wordCount = userInput.split(/\s+/).filter(Boolean).length;

  function toggleMode(id: string) {
    setSelectedModes((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  }

  function applyPreset(modes: string[]) {
    setSelectedModes(modes);
    toast.success(`Stacked ${modes.length} mode${modes.length === 1 ? "" : "s"}`);
  }

  function applyTemplate(input: string, ex: string) {
    setUserInput(input);
    setExtra(ex);
  }

  async function generate() {
    if (!userInput.trim()) {
      toast.error("Type a request first");
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
      const res = await fetch("/api/bundle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userInput,
          extraContext: extra,
          modes: selectedModes,
          cleanup: true,
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
          setError(data.error || "Generation failed");
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

  function downloadOutput() {
    if (!result) return;
    const blob = new Blob([result.output], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "master_prompt.md";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Context Bundler
          </h1>
          {selectedModes.length > 0 && (
            <Badge
              variant="secondary"
              className="rounded-full font-mono text-xs"
            >
              {selectedModes.length} mode{selectedModes.length === 1 ? "" : "s"}
            </Badge>
          )}
        </div>
        <p className="text-muted-foreground">
          Vague request in. Master prompt out. Paste it into Claude, ChatGPT,
          Gemini — anywhere.
        </p>
      </div>

      {/* Input + Output */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input */}
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">What do you want?</label>
            <Textarea
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              placeholder="e.g. build me a snake game in python"
              rows={5}
              className="resize-y font-sans text-base"
            />
            <div className="text-xs text-muted-foreground font-mono text-right">
              {userInput.length} chars · {wordCount} words
              {wordCount >= 8 && (
                <span className="text-emerald-500"> · enough context</span>
              )}
              {wordCount > 0 && wordCount < 4 && (
                <span className="text-amber-500"> · add more detail</span>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              Extra context{" "}
              <span className="text-muted-foreground font-normal">
                (optional)
              </span>
            </label>
            <Textarea
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              placeholder="anything the bundler should know — tech stack, audience, constraints"
              rows={4}
              className="resize-y"
            />
          </div>

          <Button
            onClick={generate}
            disabled={loading || !userInput.trim()}
            className="w-full h-12 text-base"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Bundling context...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Generate master prompt
              </>
            )}
          </Button>
        </div>

        {/* Output */}
        <div className="space-y-4">
          <label className="text-sm font-medium">Master prompt</label>

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
                <div className="text-sm">Validating output, may retry...</div>
              </CardContent>
            </Card>
          )}

          {result && (
            <>
              <ValidationCard result={result} />

              <div className="rounded-xl border border-border/60 bg-muted/20 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2 border-b border-border/60 bg-muted/40">
                  <span className="text-xs font-mono text-muted-foreground">
                    master_prompt.md
                  </span>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={copyOutput}
                      className="h-7 gap-1.5 text-xs"
                    >
                      <Copy className="h-3 w-3" />
                      Copy
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={downloadOutput}
                      className="h-7 gap-1.5 text-xs"
                    >
                      <Download className="h-3 w-3" />
                      Download
                    </Button>
                  </div>
                </div>
                <pre className="p-4 text-xs font-mono leading-relaxed whitespace-pre-wrap max-h-[500px] overflow-y-auto">
                  {result.output}
                </pre>
              </div>
            </>
          )}
        </div>
      </div>

      <Separator />

      {/* Templates */}
      <div className="space-y-3">
        <h2 className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
          Quick start templates
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {TEMPLATES.map((tpl, i) => (
            <button
              key={i}
              onClick={() => applyTemplate(tpl.input, tpl.extra)}
              className="text-left p-3 rounded-xl border border-border/60 bg-muted/20 hover:bg-muted/50 hover:border-primary/40 transition-all"
            >
              <div className="text-xs font-bold tracking-wider uppercase text-primary">
                {tpl.label}
              </div>
              <div className="text-sm mt-1 leading-tight">{tpl.title}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Presets */}
      <div className="space-y-3">
        <h2 className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
          Preset bundles · stack multiple modes
        </h2>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <Button
              key={preset.id}
              variant="outline"
              size="sm"
              onClick={() => applyPreset(preset.modes)}
              title={preset.description}
            >
              {preset.label}
            </Button>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedModes([])}
            disabled={selectedModes.length === 0}
            className="text-muted-foreground"
          >
            Reset all
          </Button>
        </div>
      </div>

      {/* Mode library */}
      <div className="space-y-3">
        <h2 className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
          Mode library · click any to toggle
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {MODES.map((mode) => {
            const active = selectedModes.includes(mode.id);
            return (
              <button
                key={mode.id}
                onClick={() => toggleMode(mode.id)}
                className={`text-left p-4 rounded-xl border transition-all ${
                  active
                    ? "border-primary bg-primary/5 shadow-md shadow-primary/10"
                    : "border-border/60 bg-muted/10 hover:border-border hover:bg-muted/30"
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <div
                    className={`h-2 w-2 rounded-full ${active ? "bg-primary" : "bg-muted-foreground/30"}`}
                  />
                  <div className="text-xs font-bold tracking-wider uppercase text-muted-foreground">
                    {mode.id}
                  </div>
                </div>
                <div className="font-semibold text-sm">{mode.label}</div>
                <div className="text-xs text-muted-foreground mt-0.5 mb-2">
                  {mode.short}
                </div>
                <div className="text-xs text-muted-foreground/80 leading-relaxed">
                  {mode.description}
                </div>
              </button>
            );
          })}
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
            <Sparkles className="h-4 w-4 text-muted-foreground" />
          </div>
          <h3 className="font-semibold">Ready when you are</h3>
          <p className="text-sm text-muted-foreground">
            Type a request, pick a template below, or stack modes — then hit
            Generate.
          </p>
        </div>
        <Separator />
        <ul className="space-y-2 text-sm text-muted-foreground">
          {[
            "Validated against banned words and fake references",
            "Auto-retries up to 3 times on violations",
            "Hard string surgery as last-resort cleanup",
            "Auto-fallback across 6 free Gemini models",
          ].map((line, i) => (
            <li key={i} className="flex gap-2 items-start">
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

function ValidationCard({ result }: { result: BundleResult }) {
  const { attempts, clean, surgery_replacements, refs_stripped, history } = result;

  let badgeClass = "";
  let badgeText = "";

  if (clean && surgery_replacements.length === 0 && !refs_stripped) {
    badgeClass = "bg-emerald-500/15 text-emerald-500 border-emerald-500/30";
    badgeText = attempts === 1 ? "Clean" : `Clean after ${attempts} tries`;
  } else if (clean) {
    badgeClass = "bg-amber-500/15 text-amber-500 border-amber-500/30";
    badgeText = "Salvaged";
  } else {
    badgeClass = "bg-destructive/15 text-destructive border-destructive/30";
    badgeText = "Residual issues";
  }

  return (
    <div className="rounded-xl border border-border/60 bg-muted/10 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">Validation</span>
        <span
          className={`text-[10px] font-bold tracking-wider uppercase px-2.5 py-1 rounded-md border ${badgeClass}`}
        >
          {badgeText}
        </span>
      </div>
      <Separator />
      <div className="space-y-1 font-mono text-xs">
        {history.map((h) => {
          const total = h.violations.length + h.suspicious_refs.length;
          return (
            <div
              key={h.attempt}
              className="flex items-center justify-between text-muted-foreground"
            >
              <span>Attempt {h.attempt}</span>
              <span>
                {h.word_count} words ·{" "}
                {total === 0 ? "OK" : `${total} issue${total === 1 ? "" : "s"}`}
              </span>
            </div>
          );
        })}
      </div>
      {(surgery_replacements.length > 0 || refs_stripped) && (
        <p className="text-xs text-muted-foreground italic">
          {surgery_replacements.length > 0 &&
            `Surgery: replaced ${surgery_replacements.length} stubborn banned word${surgery_replacements.length === 1 ? "" : "s"}`}
          {surgery_replacements.length > 0 && refs_stripped && " · "}
          {refs_stripped && "Stripped fabricated Reference Works section"}
        </p>
      )}
    </div>
  );
}
