import { NextRequest, NextResponse } from "next/server";

/**
 * GPTZero proxy detector — free, no auth.
 *
 * GPTZero public endpoint: https://api.gptzero.me/v2/predict/text
 * Free tier: unlimited light scans, rate-limited per IP.
 *
 * We forward the user's text, normalize the response into our local shape:
 *   { aiPct, humanPct, verdict, detector }
 *
 * If GPTZero is unreachable or rate-limits us, we fall back to a local
 * heuristic estimator (avg sentence length + filler word density) so the
 * UI never deadlocks. Heuristic is clearly labelled in the `detector` field.
 */

const GPTZERO_URL = "https://api.gptzero.me/v2/predict/text";
const MAX_INPUT_CHARS = 25_000;

interface DetectorResult {
  aiPct: number;
  humanPct: number;
  verdict: "human" | "mixed" | "ai";
  detector: string;
}

function verdictFromAiPct(pct: number): DetectorResult["verdict"] {
  if (pct < 40) return "human";
  if (pct < 70) return "mixed";
  return "ai";
}

async function callGptzero(text: string): Promise<DetectorResult | null> {
  try {
    const res = await fetch(GPTZERO_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ document: text }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      return null;
    }
    const data = await res.json();
    // GPTZero shape (best-effort tolerant):
    //   { documents: [ { class_probabilities: { ai, human, mixed }, ... } ] }
    // OR newer: { documents: [{ completely_generated_prob: 0-1 }] }
    const doc = data?.documents?.[0];
    if (!doc) return null;

    let aiPct: number | undefined;
    if (typeof doc.completely_generated_prob === "number") {
      aiPct = doc.completely_generated_prob * 100;
    } else if (doc.class_probabilities) {
      const ai = doc.class_probabilities.ai ?? doc.class_probabilities.AI ?? 0;
      aiPct = ai * 100;
    }
    if (typeof aiPct !== "number") return null;

    aiPct = Math.max(0, Math.min(100, aiPct));
    return {
      aiPct,
      humanPct: 100 - aiPct,
      verdict: verdictFromAiPct(aiPct),
      detector: "GPTZero (public)",
    };
  } catch {
    return null;
  }
}

/**
 * Local heuristic — rough proxy when GPTZero is unavailable. Not a real
 * detector; gives the UI something to show instead of an error. The goal is
 * just to have a directional signal during iteration.
 *
 * Signals (all crude, additive):
 *   - mean sentence length (LLMs cluster around 18-22; humans vary)
 *   - coefficient of variation in sentence length
 *   - filler density ("furthermore", "moreover", "additionally", "in conclusion")
 *   - hedge density ("might", "could", "perhaps", "i think")
 */
function localHeuristic(text: string): DetectorResult {
  const fillers = [
    "furthermore",
    "moreover",
    "additionally",
    "in conclusion",
    "in summary",
    "it is important to note",
    "comprehensive",
    "leverage",
    "streamline",
    "robust",
    "ensure",
    "ultimately",
  ];
  const hedges = ["might", "could", "perhaps", "i think", "in my opinion", "kind of", "sort of"];

  const lower = text.toLowerCase();
  const sentences = text
    .split(/[.!?]+\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const wordCounts = sentences.map((s) => s.split(/\s+/).length);
  const n = wordCounts.length || 1;
  const mean = wordCounts.reduce((a, b) => a + b, 0) / n;
  const variance =
    wordCounts.reduce((acc, w) => acc + (w - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);
  const cv = mean > 0 ? std / mean : 0;

  const fillerHits = fillers.reduce(
    (acc, f) => acc + (lower.split(f).length - 1),
    0
  );
  const hedgeHits = hedges.reduce(
    (acc, h) => acc + (lower.split(h).length - 1),
    0
  );

  // Crude scoring: low CV + high filler density + low hedge density → AI-ish
  let aiScore = 50;
  if (cv < 0.4) aiScore += 25;
  else if (cv < 0.6) aiScore += 10;
  else aiScore -= 10;
  aiScore += Math.min(20, fillerHits * 4);
  aiScore -= Math.min(15, hedgeHits * 3);
  aiScore = Math.max(0, Math.min(100, aiScore));

  return {
    aiPct: aiScore,
    humanPct: 100 - aiScore,
    verdict: verdictFromAiPct(aiScore),
    detector: "local heuristic (GPTZero unavailable)",
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { text } = body;
    if (!text || typeof text !== "string" || !text.trim()) {
      return NextResponse.json(
        { error: "text is required" },
        { status: 400 }
      );
    }
    if (text.length > MAX_INPUT_CHARS) {
      return NextResponse.json(
        {
          error: `Input is ${text.length.toLocaleString()} characters; max is ${MAX_INPUT_CHARS.toLocaleString()}.`,
        },
        { status: 400 }
      );
    }

    const result = (await callGptzero(text)) ?? localHeuristic(text);
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "detect failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
