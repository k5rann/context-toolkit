// Adversarial paraphrasing — based on the NeurIPS 2025 Adversarial-
// Paraphrasing technique (chengez/Adversarial-Paraphrasing on GitHub).
//
// Idea: instead of guessing what the detector will catch, generate N
// candidate rewrites at different temperatures, score each against a
// surrogate detector, pick the lowest-AI-score winner. The surrogate
// detector signal transfers reasonably well to other detectors of the
// same family (transformer classifiers fine-tuned on AI/human pairs).
//
// v1: single iteration, parallel candidate generation. Fits comfortably
// in Vercel's 60s maxDuration. If results are close-but-not-there we
// can add a second iteration as v2.

import { scoreWithDetector, type DetectorScore } from "./hf-detector";
import {
  buildAdversarialPrompt,
  type HumanizerContentMode,
} from "./prompts/humanizer-template";
import type { HumanizerReferenceStyle } from "./humanizer-reference-library";
import { GoogleGenerativeAI } from "@google/generative-ai";

// 5 temperatures spread across the diversity range. Low temps produce
// safer, more probable text (which detectors flag); high temps add
// randomness (which lowers detector confidence but risks meaning drift).
// We let the detector decide which point is best for THIS specific text.
const TEMPERATURES = [0.6, 0.85, 1.0, 1.15, 1.3];
const REWRITE_MODEL = "gemini-2.5-flash";

export interface AdversarialOptions {
  text: string;
  contentMode: HumanizerContentMode;
  referenceStyle: HumanizerReferenceStyle;
  writingSample?: string;
  sourceNotes?: string;
  geminiApiKey: string;
  hfApiKey: string;
}

export interface AdversarialCandidate {
  text: string;
  temperature: number;
  detectorScore: DetectorScore;
  generationOk: boolean;
  scoringOk: boolean;
  errorMessage?: string;
}

export interface AdversarialResult {
  output: string;
  bestIdx: number;
  detectorModel: string;
  candidates: AdversarialCandidate[];
  meta: {
    candidatesGenerated: number;
    candidatesScored: number;
    elapsedMs: number;
  };
}

async function generateCandidate(
  prompt: string,
  temperature: number,
  apiKey: string
): Promise<string> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: REWRITE_MODEL,
    generationConfig: { temperature },
  });
  const result = await model.generateContent(prompt);
  return result.response.text().trim();
}

function stripPreamble(s: string): string {
  return s
    .replace(
      /^(?:here(?:'s| is)?\s+(?:the\s+)?(?:rewritten|revised|edited|polished|final)[^\n:]*:?\s*)/i,
      ""
    )
    .replace(/^(?:rewritten|revised|edited|polished|final)(?:\s+text)?\s*:\s*/i, "")
    .replace(/^output\s*:\s*/i, "")
    .replace(/^["'“]/, "")
    .replace(/["'”]$/, "")
    .trim();
}

export async function humanizeAdversarial(
  opts: AdversarialOptions
): Promise<AdversarialResult> {
  const startedAt = Date.now();

  // Adversarial uses its own prompt — the voice-rewrite prompt biases too
  // hard toward compression for our test (it lost 60% of input length).
  // Adversarial path is purely about paraphrase + length + perplexity
  // disruption. contentMode/referenceStyle/writingSample are intentionally
  // ignored here; they belong to the voice-matching humanizer flow.
  const originalWordCount = opts.text.trim().split(/\s+/).filter(Boolean).length;
  const prompt = buildAdversarialPrompt(opts.text, originalWordCount);

  // Generate all candidates in parallel. If any one fails we still
  // proceed with the rest — better to score 4 than fail the whole run.
  const generations = await Promise.allSettled(
    TEMPERATURES.map((t) => generateCandidate(prompt, t, opts.geminiApiKey))
  );

  const draftCandidates: Array<{
    text: string;
    temperature: number;
    generationOk: boolean;
    errorMessage?: string;
  }> = generations.map((g, i) => {
    if (g.status === "fulfilled") {
      return {
        text: stripPreamble(g.value),
        temperature: TEMPERATURES[i],
        generationOk: true,
      };
    }
    return {
      text: "",
      temperature: TEMPERATURES[i],
      generationOk: false,
      errorMessage:
        g.reason instanceof Error ? g.reason.message : String(g.reason),
    };
  });

  const generatedCount = draftCandidates.filter((c) => c.generationOk).length;
  if (generatedCount === 0) {
    throw new Error(
      "All candidate generations failed. " +
        (draftCandidates[0]?.errorMessage ?? "Check Gemini key and quota.")
    );
  }

  // Score every successful candidate in parallel against the surrogate detector.
  const scoringResults = await Promise.allSettled(
    draftCandidates.map((c) =>
      c.generationOk
        ? scoreWithDetector({ text: c.text, apiKey: opts.hfApiKey })
        : Promise.reject(new Error("skipped (generation failed)"))
    )
  );

  const candidates: AdversarialCandidate[] = draftCandidates.map((c, i) => {
    const r = scoringResults[i];
    if (r.status === "fulfilled") {
      return { ...c, detectorScore: r.value, scoringOk: true };
    }
    return {
      ...c,
      detectorScore: {
        aiProbability: 1, // assume worst when scoring fails
        humanProbability: 0,
        rawLabels: [],
        model: "unknown",
        textLength: c.text.length,
      },
      scoringOk: false,
      errorMessage:
        c.errorMessage ??
        (r.reason instanceof Error ? r.reason.message : String(r.reason)),
    };
  });

  // Pick the lowest aiProbability among candidates that BOTH generated AND scored.
  const eligible = candidates.filter((c) => c.generationOk && c.scoringOk);
  if (eligible.length === 0) {
    // Fallback: pick the longest successful generation (better than nothing).
    const fallback = candidates.find((c) => c.generationOk);
    if (!fallback) {
      throw new Error(
        "No candidates passed generation or scoring. " +
          (candidates[0]?.errorMessage ?? "")
      );
    }
    const idx = candidates.indexOf(fallback);
    return {
      output: fallback.text,
      bestIdx: idx,
      detectorModel: candidates[0]?.detectorScore.model ?? "unknown",
      candidates,
      meta: {
        candidatesGenerated: generatedCount,
        candidatesScored: 0,
        elapsedMs: Date.now() - startedAt,
      },
    };
  }

  let best = eligible[0];
  for (const c of eligible) {
    if (c.detectorScore.aiProbability < best.detectorScore.aiProbability) {
      best = c;
    }
  }
  const bestIdx = candidates.indexOf(best);

  return {
    output: best.text,
    bestIdx,
    detectorModel: best.detectorScore.model,
    candidates,
    meta: {
      candidatesGenerated: generatedCount,
      candidatesScored: eligible.length,
      elapsedMs: Date.now() - startedAt,
    },
  };
}
