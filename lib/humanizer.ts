import { generate } from "./llm";
import {
  buildQualityPolishPrompt,
  buildVoiceRewritePrompt,
  HumanizerContentMode,
  HumanizerModelPreset,
} from "./prompts/humanizer-template";
import type { HumanizerReferenceStyle } from "./humanizer-reference-library";

const PRESET_MODELS: Record<
  HumanizerModelPreset,
  { rewriteModel: string; polishModel?: string }
> = {
  fast: {
    rewriteModel: "gemini-2.5-flash",
  },
  balanced: {
    rewriteModel: "gemini-2.5-flash",
    polishModel: "gemini-2.5-flash",
  },
  quality: {
    rewriteModel: "gemini-2.5-pro",
    polishModel: "gemini-2.5-pro",
  },
  // Experimental: route through OpenRouter to non-Gemini models. Different
  // model fingerprints — primary purpose is to test whether swapping the
  // base model alone breaks Copyleaks (Gemini's per-token perplexity is the
  // wall against Copyleaks-class detectors).
  // Single-pass: OpenRouter free tier rate-limits are tight, polish pass
  // adds latency we don't need for the fingerprint test.
  // Verified working model IDs as of 2026-05-08; OpenRouter retires free
  // models often — re-check `curl https://openrouter.ai/api/v1/models` if
  // any of these 404 in the future.
  "experimental-llama": {
    rewriteModel: "meta-llama/llama-3.3-70b-instruct:free",
  },
  "experimental-qwen": {
    rewriteModel: "qwen/qwen3-next-80b-a3b-instruct:free",
  },
  "experimental-minimax": {
    rewriteModel: "minimax/minimax-m2.5:free",
  },
  // Adversarial preset is dispatched in the API route directly to
  // humanizeAdversarial — it never reaches this map. Stub entry exists
  // only so the Record<HumanizerModelPreset, ...> type stays exhaustive.
  adversarial: {
    rewriteModel: "gemini-2.5-flash",
  },
};

export interface HumanizeOptions {
  text: string;
  contentMode: HumanizerContentMode;
  referenceStyle: HumanizerReferenceStyle;
  modelPreset?: HumanizerModelPreset;
  writingSample?: string;
  sourceNotes?: string;
  apiKey: string;
}

export interface QualityScores {
  readability: number;
  repetition: number;
  genericPhrasing: number;
  sentenceVariety: number;
  specificity: number;
  meaningRetention: number;
  overall: number;
  notes: string[];
}

export interface HumanizeResult {
  output: string;
  pass1Output: string;
  contentMode: HumanizerContentMode;
  referenceStyle: HumanizerReferenceStyle;
  modelPreset: HumanizerModelPreset;
  originalWordCount: number;
  outputWordCount: number;
  passes: number;
  quality: QualityScores;
}

export interface HumanizeBakeoffVariant {
  id: string;
  label: string;
  description: string;
  result: HumanizeResult;
}

export interface HumanizeBakeoffResult {
  bestId: string;
  variants: HumanizeBakeoffVariant[];
}

function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function sentences(s: string): string[] {
  return s
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function words(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9'\s-]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);
}

function stripWrappingQuotes(s: string): string {
  const t = s.trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'")) ||
    (t.startsWith("\u201c") && t.endsWith("\u201d"))
  ) {
    return t.slice(1, -1).trim();
  }
  return t;
}

function stripPreamble(s: string): string {
  return s
    .replace(
      /^(?:here(?:'s| is)?\s+(?:the\s+)?(?:rewritten|revised|edited|polished|final)[^\n:]*:?\s*)/i,
      ""
    )
    .replace(/^(?:rewritten|revised|edited|polished|final)(?:\s+text)?\s*:\s*/i, "")
    .replace(/^output\s*:\s*/i, "");
}

function clean(raw: string): string {
  return stripWrappingQuotes(stripPreamble(raw)).trim();
}

const GENERIC_PATTERNS: RegExp[] = [
  /\bdelv(?:e|es|ed|ing)\b/i,
  /\btapestry\b/i,
  /\brealm\b/i,
  /\bmoreover\b/i,
  /\bfurthermore\b/i,
  /\badditionally\b/i,
  /\bin conclusion\b/i,
  /\bin summary\b/i,
  /\bit'?s important to note\b/i,
  /\bit'?s worth noting\b/i,
  /\bnavigate the (?:complexities|nuances)\b/i,
  /\brobust\b/i,
  /\bseamless\b/i,
  /\bholistic\b/i,
  /\bmultifaceted\b/i,
  /\bleverage\b/i,
  /\btestament to\b/i,
  /\bpivotal\b/i,
  /\bparamount\b/i,
  /\busher(?:s|ing)? in\b/i,
  /\bcutting-edge\b/i,
  /\bstate-of-the-art\b/i,
  /\bworld-class\b/i,
  /\bbest-in-class\b/i,
  /\bindustry-leading\b/i,
  /\bunlock\b/i,
  /\belevate\b/i,
  /\bempower\b/i,
  /\btransform your business\b/i,
  /\btake your business to the next level\b/i,
  /\btailored solutions\b/i,
  /\bbespoke solutions\b/i,
  /\bcomprehensive solutions\b/i,
  /\binnovative solutions\b/i,
  /\bdesigned to meet your unique needs\b/i,
  /\bin today's competitive landscape\b/i,
  /\bcommitted to excellence\b/i,
  /\bpassionate about excellence\b/i,
  /\byour trusted partner\b/i,
  /\bnot just\b.+\bbut also\b/i,
  /\boffers several key benefits\b/i,
  /\bthe primary challenge\b/i,
  /\bthe real challenge\b/i,
  /\bthe goal is to create\b/i,
  /\bprioritizing clarity over sheer volume\b/i,
  /\bprotect limited attention\b/i,
  /\bquiet landing spots\b/i,
  /\bmental fatigue\b/i,
  /\boverlapping responsibilities\b/i,
  /\bunclear priorities\b/i,
];

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "for",
  "from",
  "has",
  "have",
  "he",
  "her",
  "his",
  "i",
  "in",
  "is",
  "it",
  "its",
  "of",
  "on",
  "or",
  "our",
  "she",
  "that",
  "the",
  "their",
  "they",
  "this",
  "to",
  "was",
  "we",
  "were",
  "with",
  "you",
  "your",
]);

function contentWords(s: string): string[] {
  return words(s).filter((w) => w.length > 3 && !STOP_WORDS.has(w));
}

function stddev(values: number[]): number {
  if (values.length === 0) return 0;
  const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance =
    values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / values.length;
  return Math.sqrt(variance);
}

function uniqueRatio(items: string[]): number {
  if (items.length === 0) return 1;
  return new Set(items).size / items.length;
}

function scoreQuality(
  original: string,
  output: string,
  sourceNotes = ""
): QualityScores {
  const outputSentences = sentences(output);
  const sentenceLengths = outputSentences.map((s) => wordCount(s));
  const avgSentenceLength =
    sentenceLengths.reduce((sum, n) => sum + n, 0) /
    Math.max(1, sentenceLengths.length);
  const longSentenceCount = sentenceLengths.filter((n) => n > 34).length;
  const veryShortRun =
    sentenceLengths.filter((n) => n <= 4).length > Math.ceil(sentenceLengths.length / 2);

  const readability = clampScore(
    100 -
      Math.abs(avgSentenceLength - 18) * 2 -
      longSentenceCount * 8 -
      (veryShortRun ? 12 : 0)
  );

  const outputWords = words(output);
  const starts = outputSentences.map((s) => words(s)[0]).filter(Boolean);
  const repeatedStarts = starts.length - new Set(starts).size;
  const repeatedWordPenalty = Math.max(0, outputWords.length - new Set(outputWords).size);
  const repetition = clampScore(
    100 - repeatedStarts * 8 - Math.min(35, repeatedWordPenalty / 4)
  );

  const genericHits = GENERIC_PATTERNS.reduce(
    (sum, pattern) => sum + (pattern.test(output) ? 1 : 0),
    0
  );
  const genericPhrasing = clampScore(100 - genericHits * 12);

  const lengthStdDev = stddev(sentenceLengths);
  const sentenceVariety = clampScore(
    55 + Math.min(35, lengthStdDev * 4) + uniqueRatio(starts) * 10 - repeatedStarts * 5
  );

  const notesContent = Array.from(new Set(contentWords(sourceNotes)));
  const outputContent = new Set(contentWords(output));
  const noteRetention =
    notesContent.length === 0
      ? null
      : notesContent.filter((w) => outputContent.has(w)).length /
        notesContent.length;
  const digitSignals = (output.match(/\d/g) ?? []).length;
  const properNounSignals =
    output.match(/\b[A-Z][a-z]{2,}\b/g)?.filter((w) => !["The", "This"].includes(w))
      .length ?? 0;
  const firstPersonSignals =
    output.match(/\b(?:I|me|my|mine|we|us|our|ours)\b/g)?.length ?? 0;
  const specificity = clampScore(
    noteRetention === null
      ? 58 +
          Math.min(18, digitSignals * 4) +
          Math.min(14, properNounSignals * 3) +
          Math.min(10, firstPersonSignals * 2)
      : 45 + noteRetention * 55
  );

  const originalContent = Array.from(new Set(contentWords(original)));
  const retained =
    originalContent.length === 0
      ? 1
      : originalContent.filter((w) => outputContent.has(w)).length /
        originalContent.length;
  const lengthRatio =
    wordCount(original) === 0 ? 1 : wordCount(output) / Math.max(1, wordCount(original));
  const lengthPenalty =
    lengthRatio < 0.65 || lengthRatio > 1.45
      ? 18
      : lengthRatio < 0.8 || lengthRatio > 1.25
        ? 8
        : 0;
  const meaningRetention = clampScore(retained * 100 - lengthPenalty);

  const overall = clampScore(
    readability * 0.17 +
      repetition * 0.15 +
      genericPhrasing * 0.18 +
      sentenceVariety * 0.15 +
      specificity * 0.15 +
      meaningRetention * 0.2
  );

  const notes: string[] = [];
  if (readability < 75) notes.push("Readability could be cleaner.");
  if (repetition < 75) notes.push("Some repeated wording or sentence starts remain.");
  if (genericPhrasing < 85) notes.push("Generic phrasing still appears in the draft.");
  if (sentenceVariety < 75) notes.push("Sentence rhythm is still a bit uniform.");
  if (specificity < 75) {
    notes.push(
      sourceNotes.trim()
        ? "More source-note detail could survive into the rewrite."
        : "Add source notes or personal details for a more grounded rewrite."
    );
  }
  if (meaningRetention < 75) {
    notes.push("Meaning retention looks low; compare against the original before using.");
  }
  if (notes.length === 0) {
    notes.push("Internal checks look healthy. Still read once before sending.");
  }

  return {
    readability,
    repetition,
    genericPhrasing,
    sentenceVariety,
    specificity,
    meaningRetention,
    overall,
    notes,
  };
}

export async function humanize({
  text,
  contentMode,
  referenceStyle,
  modelPreset = "balanced",
  writingSample = "",
  sourceNotes = "",
  apiKey,
}: HumanizeOptions): Promise<HumanizeResult> {
  const trimmed = text.trim();
  const originalWordCount = wordCount(trimmed);
  const preset = PRESET_MODELS[modelPreset] ?? PRESET_MODELS.balanced;

  const pass1Raw = await generate({
    apiKey,
    prompt: buildVoiceRewritePrompt({
      text: trimmed,
      contentMode,
      referenceStyle,
      writingSample,
      sourceNotes,
    }),
    preferredModel: preset.rewriteModel,
  });
  const pass1Output = clean(pass1Raw);

  let finalOutput = pass1Output;
  let passes = 1;

  if (preset.polishModel) {
    const polishRaw = await generate({
      apiKey,
      prompt: buildQualityPolishPrompt({
        original: trimmed,
        rewritten: pass1Output,
        contentMode,
        referenceStyle,
        writingSample,
        sourceNotes,
        originalWordCount,
      }),
      preferredModel: preset.polishModel,
    });
    finalOutput = clean(polishRaw);
    passes = 2;
  }

  return {
    output: finalOutput,
    pass1Output,
    contentMode,
    referenceStyle,
    modelPreset,
    originalWordCount,
    outputWordCount: wordCount(finalOutput),
    passes,
    quality: scoreQuality(trimmed, finalOutput, sourceNotes),
  };
}

export async function humanizeBakeoff({
  text,
  contentMode,
  referenceStyle,
  writingSample = "",
  sourceNotes = "",
  apiKey,
}: Omit<HumanizeOptions, "modelPreset">): Promise<HumanizeBakeoffResult> {
  const configs: Array<{
    id: string;
    label: string;
    description: string;
    modelPreset: HumanizerModelPreset;
  }> = [
    {
      id: "fast",
      label: "Fast",
      description: "One-pass cleanup. Useful when the draft already has a voice.",
      modelPreset: "fast",
    },
    {
      id: "balanced",
      label: "Balanced",
      description: "Two-pass rewrite and polish. Best default for most text.",
      modelPreset: "balanced",
    },
    {
      id: "quality",
      label: "Quality",
      description: "Stronger model preference for harder rewrites.",
      modelPreset: "quality",
    },
  ];

  const variants: HumanizeBakeoffVariant[] = [];
  for (const config of configs) {
    const result = await humanize({
      text,
      contentMode,
      referenceStyle,
      modelPreset: config.modelPreset,
      writingSample,
      sourceNotes,
      apiKey,
    });
    variants.push({
      id: config.id,
      label: config.label,
      description: config.description,
      result,
    });
  }

  const best = variants.reduce((winner, variant) =>
    variant.result.quality.overall > winner.result.quality.overall
      ? variant
      : winner
  );

  return {
    bestId: best.id,
    variants,
  };
}
