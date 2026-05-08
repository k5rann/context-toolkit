"use client";

import * as React from "react";
import { BarChart3, Copy, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  analyzeTransformation,
  type TransformationAnalysis,
} from "@/lib/transformation-analysis";

export function TransformPage() {
  const [original, setOriginal] = React.useState("");
  const [revised, setRevised] = React.useState("");
  const [analysis, setAnalysis] =
    React.useState<TransformationAnalysis | null>(null);

  function analyze() {
    setAnalysis(analyzeTransformation(original, revised));
  }

  function clearAll() {
    setOriginal("");
    setRevised("");
    setAnalysis(null);
  }

  function swap() {
    setOriginal(revised);
    setRevised(original);
    setAnalysis(null);
  }

  async function pasteOriginal() {
    const text = await navigator.clipboard.readText();
    setOriginal(text);
  }

  async function pasteRevised() {
    const text = await navigator.clipboard.readText();
    setRevised(text);
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
          Transformation Lab
        </h1>
        <p className="text-muted-foreground">
          Compare an original draft with any rewrite. See what changed in
          structure, wording, specificity, and meaning risk.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <InputPanel
          label="Original"
          value={original}
          onChange={setOriginal}
          onPaste={pasteOriginal}
          placeholder="Paste the starting draft..."
        />
        <InputPanel
          label="Rewrite"
          value={revised}
          onChange={setRevised}
          onPaste={pasteRevised}
          placeholder="Paste the rewritten version from any tool or model..."
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          onClick={analyze}
          disabled={!original.trim() || !revised.trim()}
          className="gap-2"
        >
          <BarChart3 className="h-4 w-4" />
          Analyze transformation
        </Button>
        <Button variant="outline" onClick={swap} disabled={!original && !revised}>
          <RefreshCw className="h-4 w-4" />
          Swap
        </Button>
        <Button
          variant="ghost"
          onClick={clearAll}
          disabled={!original && !revised && !analysis}
          className="text-muted-foreground"
        >
          Clear
        </Button>
      </div>

      {analysis && <AnalysisView analysis={analysis} />}
    </div>
  );
}

function InputPanel({
  label,
  value,
  onChange,
  onPaste,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onPaste: () => void;
  placeholder: string;
}) {
  const words = value.split(/\s+/).filter(Boolean).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">{label}</label>
        <Button variant="ghost" size="sm" onClick={onPaste} className="h-7 gap-1.5 text-xs">
          <Copy className="h-3 w-3" />
          Paste
        </Button>
      </div>
      <Textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={12}
        className="resize-y text-base leading-relaxed"
      />
      <div className="text-xs text-muted-foreground font-mono text-right">
        {value.length.toLocaleString()} chars · {words} words
      </div>
    </div>
  );
}

function AnalysisView({ analysis }: { analysis: TransformationAnalysis }) {
  return (
    <div className="space-y-6">
      <Separator />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {analysis.metrics.map((metric) => (
          <Card key={metric.label} className="border-border/60 bg-muted/10">
            <CardContent className="p-4 space-y-3">
              <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                {metric.label}
              </div>
              <div className="flex items-end justify-between gap-3">
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">
                    {metric.before}
                  </div>
                  <div className="text-lg font-semibold">{metric.after}</div>
                </div>
                <div className="text-xs font-mono text-muted-foreground">
                  {metric.delta}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <InfoBlock title="Observations" lines={analysis.observations} />
        <InfoBlock title="Added Terms" lines={analysis.addedTerms} empty="No major added terms." />
        <InfoBlock
          title="Removed Terms"
          lines={analysis.removedTerms}
          empty="No major removed terms."
        />
      </div>
    </div>
  );
}

function InfoBlock({
  title,
  lines,
  empty = "Nothing to show.",
}: {
  title: string;
  lines: string[];
  empty?: string;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/10 p-4 space-y-3">
      <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
        {title}
      </div>
      <ul className="space-y-2 text-sm text-muted-foreground">
        {(lines.length ? lines : [empty]).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  );
}
