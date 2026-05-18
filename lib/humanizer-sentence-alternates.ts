/**
 * Sentence-level alternate generator — mirrors StealthWriter's architecture
 * (see research/stealthwriter-recon/API-CRACKED.md). Their pipeline:
 *
 *   input -> split into sentences
 *           -> for each: generate 3-4 alternatives (ranks 0.99, 0.88, 0.82, 0.003)
 *           -> always include original as lowest-ranked alternative
 *           -> top-ranked alternative selected by default
 *
 * Why this might evade Copyleaks better than a single full-text rewrite:
 *   1. Each sentence is processed independently — no document-level AI fingerprint
 *   2. Multiple candidate rewrites + rank-based selection introduces diversity
 *   3. Sentence boundaries are natural variation points; humans rewrite sentences
 *      one at a time, not whole essays in one breath
 *
 * Not used in production yet — exported for the autoresearch loop to integrate
 * as one experimental preset option.
 */

import { generate } from "./llm";

export interface SentenceAlternate {
  text: string;
  rank: number; // 0-1, higher = more aggressively rewritten
}

export interface ProcessedSentence {
  original: string;
  alternatives: SentenceAlternate[];
  selected: string; // top-ranked alternative
}

const SENTENCE_REWRITE_PROMPT = (sentence: string) => `Rewrite this single sentence in three different ways. Each rewrite must preserve every factual claim and named entity. The three versions should differ in how aggressively they restructure the sentence — heavy rewrite that uses different phrasing entirely, medium rewrite that keeps some original phrasing, and light rewrite that only swaps a few words. Output exactly three lines. No numbering, no labels, no commentary. One rewrite per line.

ORIGINAL SENTENCE:
${sentence}

THREE REWRITES (heavy, medium, light — in that order, one per line):`;

/**
 * Split text into sentences using a conservative regex. Handles common
 * abbreviations (Mr., Dr., e.g., etc.) to avoid mid-sentence splits.
 */
export function splitSentences(text: string): string[] {
  const protect = (s: string) =>
    s
      .replace(/\b(Mr|Mrs|Ms|Dr|Prof|Sr|Jr|vs|etc|e\.g|i\.e|U\.S|U\.K)\./g, "$1<DOT>")
      .replace(/\b([A-Z])\./g, "$1<DOT>");
  const restore = (s: string) => s.replace(/<DOT>/g, ".");

  const protectedText = protect(text);
  const raw = protectedText
    .split(/(?<=[.!?])\s+(?=[A-Z"'(])/g)
    .map((s) => restore(s.trim()))
    .filter(Boolean);
  return raw;
}

/**
 * Parse three lines from a single LLM response. Tolerant to numbering,
 * blank lines, and minor format drift.
 */
function parseThreeRewrites(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((l) =>
      l
        .trim()
        .replace(/^[\-\*•\d]+[\.\)]\s*/, "")
        .replace(/^(heavy|medium|light)\s*[:\-]\s*/i, "")
    )
    .filter((l) => l.length > 8)
    .slice(0, 3);
}

/**
 * Generate alternates for a single sentence. Returns top-ranked rewrite
 * plus the full set (for downstream display / ranking).
 */
export async function generateSentenceAlternates(opts: {
  sentence: string;
  apiKey: string;
  model?: string;
  timeoutMs?: number;
}): Promise<ProcessedSentence> {
  const { sentence, apiKey, model = "gemini-2.5-flash", timeoutMs = 20_000 } = opts;
  const raw = await generate({
    apiKey,
    prompt: SENTENCE_REWRITE_PROMPT(sentence),
    preferredModel: model,
    temperature: 0.95,
    timeoutMs,
  });
  const rewrites = parseThreeRewrites(raw);

  // If parsing failed, fall back to the original
  if (rewrites.length === 0) {
    return {
      original: sentence,
      alternatives: [{ text: sentence, rank: 0.0 }],
      selected: sentence,
    };
  }

  // Heavy = highest rank, light = lowest. Map positionally.
  const ranks = [0.95, 0.85, 0.7];
  const alternatives: SentenceAlternate[] = rewrites.map((text, i) => ({
    text,
    rank: ranks[i] ?? 0.6,
  }));
  // Always include the original as lowest-ranked alternative (per SW pattern)
  alternatives.push({ text: sentence, rank: 0.05 });

  // experiment iter 1: select MEDIUM (rank 0.85) instead of heaviest.
  // SW's outputs run 1.06x input length with low burstiness; the heaviest
  // rewrite typically lengthens and restructures aggressively, moving us
  // AWAY from SW's tight stylometric fingerprint.
  const TARGET_RANK = 0.85;
  const selected = alternatives.reduce((best, cur) =>
    Math.abs(cur.rank - TARGET_RANK) < Math.abs(best.rank - TARGET_RANK)
      ? cur
      : best
  ).text;

  return { original: sentence, alternatives, selected };
}

/**
 * Full-text humanizer using sentence-level processing. Splits the input,
 * processes each sentence in parallel (bounded concurrency to avoid
 * rate-limit storms), and reassembles.
 */
export async function humanizeBySentences(opts: {
  text: string;
  apiKey: string;
  model?: string;
  concurrency?: number;
  timeoutMs?: number;
}): Promise<{
  output: string;
  sentences: ProcessedSentence[];
}> {
  const { text, apiKey, model, concurrency = 4, timeoutMs } = opts;
  const sentences = splitSentences(text);

  const results: ProcessedSentence[] = new Array(sentences.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= sentences.length) return;
      try {
        results[i] = await generateSentenceAlternates({
          sentence: sentences[i],
          apiKey,
          model,
          timeoutMs,
        });
      } catch {
        // Per-sentence failure falls back to original
        results[i] = {
          original: sentences[i],
          alternatives: [{ text: sentences[i], rank: 0.0 }],
          selected: sentences[i],
        };
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, sentences.length) }, () =>
      worker()
    )
  );

  // Reassemble: spaces between sentences. If original had paragraph breaks,
  // preserve them by detecting double newlines in source.
  const paragraphSplits = text
    .split(/\n\s*\n/)
    .map((p) => splitSentences(p).length);
  let idx = 0;
  const paragraphs: string[] = [];
  for (const count of paragraphSplits) {
    const chunk = results.slice(idx, idx + count);
    paragraphs.push(chunk.map((r) => r.selected).join(" "));
    idx += count;
  }
  // If our split miscounted, fall back to all-in-one
  const reassembled =
    idx === sentences.length
      ? paragraphs.join("\n\n")
      : results.map((r) => r.selected).join(" ");

  return { output: reassembled, sentences: results };
}
