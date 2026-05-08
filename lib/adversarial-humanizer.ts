// Adversarial paraphrasing — based on the NeurIPS 2025 Adversarial-
// Paraphrasing technique (chengez/Adversarial-Paraphrasing on GitHub).
//
// Idea: instead of guessing what the detector will catch, generate N
// candidate rewrites at different temperatures, score each against a
// surrogate detector, pick the lowest-AI-score winner. The surrogate
// detector signal transfers reasonably well to other detectors of the
// same family (transformer classifiers fine-tuned on AI/human pairs).
//
// v2 update: dual-provider — adversarial loop now supports either Gemini
// or any OpenRouter model (e.g. MiniMax). Different model fingerprints
// give us more shots at content-shape walls Copyleaks pattern-matches
// (essay-shape resists Gemini-adversarial; MiniMax-adversarial may break
// it).

import { scoreWithDetector, type DetectorScore } from "./hf-detector";
import { buildAdversarialPrompt } from "./prompts/humanizer-template";
import { generateOpenRouter } from "./openrouter";
import { GoogleGenerativeAI } from "@google/generative-ai";

// 5 temperatures spread across the diversity range. Low temps produce
// safer, more probable text (which detectors flag); high temps add
// randomness (which lowers detector confidence but risks meaning drift).
// We let the detector decide which point is best for THIS specific text.
const TEMPERATURES = [0.6, 0.85, 1.0, 1.15, 1.3];
const GEMINI_MODEL = "gemini-2.5-flash";

export type AdversarialProvider = "gemini" | "openrouter";

export interface AdversarialOptions {
  text: string;
  provider: AdversarialProvider;
  hfApiKey: string;
  // Only one of these is required, depending on provider:
  geminiApiKey?: string;
  openrouterApiKey?: string;
  openrouterModel?: string; // e.g. "minimax/minimax-m2.5:free"
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
  generatorModel: string;
  candidates: AdversarialCandidate[];
  meta: {
    candidatesGenerated: number;
    candidatesScored: number;
    elapsedMs: number;
  };
}

async function generateGeminiCandidate(
  prompt: string,
  temperature: number,
  apiKey: string
): Promise<string> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    generationConfig: { temperature },
  });
  const result = await model.generateContent(prompt);
  return result.response.text().trim();
}

async function generateOpenRouterCandidate(
  prompt: string,
  temperature: number,
  apiKey: string,
  model: string
): Promise<string> {
  return generateOpenRouter({ apiKey, prompt, model, temperature });
}

function stripPreamble(s: string): string {
  return s
    .replace(
      /^(?:here(?:'s| is)?\s+(?:the\s+)?(?:rewritten|revised|edited|polished|final|paraphrased)[^\n:]*:?\s*)/i,
      ""
    )
    .replace(
      /^(?:rewritten|revised|edited|polished|final|paraphrased)(?:\s+text)?\s*:\s*/i,
      ""
    )
    .replace(/^output\s*:\s*/i, "")
    .replace(/^["'“]/, "")
    .replace(/["'”]$/, "")
    .trim();
}

export async function humanizeAdversarial(
  opts: AdversarialOptions
): Promise<AdversarialResult> {
  const startedAt = Date.now();
  const originalWordCount = opts.text.trim().split(/\s+/).filter(Boolean).length;
  const prompt = buildAdversarialPrompt(opts.text, originalWordCount);

  // Validate the right keys are present for the selected provider.
  if (opts.provider === "gemini" && !opts.geminiApiKey) {
    throw new Error("Gemini provider needs geminiApiKey.");
  }
  if (opts.provider === "openrouter") {
    if (!opts.openrouterApiKey) {
      throw new Error("OpenRouter provider needs openrouterApiKey.");
    }
    if (!opts.openrouterModel) {
      throw new Error("OpenRouter provider needs openrouterModel.");
    }
  }

  const generatorLabel =
    opts.provider === "gemini" ? GEMINI_MODEL : opts.openrouterModel ?? "openrouter";

  // Generate all candidates in parallel. If any one fails we still
  // proceed with the rest — better to score 4 than fail the whole run.
  const generations = await Promise.allSettled(
    TEMPERATURES.map((t) =>
      opts.provider === "gemini"
        ? generateGeminiCandidate(prompt, t, opts.geminiApiKey!)
        : generateOpenRouterCandidate(
            prompt,
            t,
            opts.openrouterApiKey!,
            opts.openrouterModel!
          )
    )
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
    const firstErr = draftCandidates[0]?.errorMessage ?? "no detail";
    throw new Error(
      `All ${TEMPERATURES.length} candidate generations failed (${generatorLabel}). First error: ${firstErr}`
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
      generatorModel: generatorLabel,
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
    generatorModel: generatorLabel,
    candidates,
    meta: {
      candidatesGenerated: generatedCount,
      candidatesScored: eligible.length,
      elapsedMs: Date.now() - startedAt,
    },
  };
}
