/**
 * Fast local "human-likeness" scorer for picking between candidate rewrites.
 *
 * Higher score = more human-looking. No external API calls — runs in <1ms
 * per text. Used in the adversarial sampling loop where we generate N
 * Llama variants and need to pick the best one quickly.
 *
 * Signals (additive, 0–1 each):
 *
 *  1. AI trigger word density (lower = better)
 *  2. Em-dash presence (lower = better — em-dashes are a Copyleaks fingerprint)
 *  3. Sentence length variance / burstiness (higher = better)
 *  4. Contraction density (higher = better — humans contract, AI doesn't)
 *  5. AI hedging phrase density (lower = better)
 *  6. Avg sentence length proximity to AI mean ~20 words (further = better)
 *  7. Punctuation variety (higher = better)
 *  8. Filler word presence (presence = +)
 */

const AI_TRIGGER_WORDS = [
  "robust", "comprehensive", "multifaceted", "crucial", "proactive",
  "safeguarding", "leverage", "unprecedented", "sophisticated", "enhance",
  "optimize", "streamline", "facilitate", "utilize", "paradigm", "holistic",
  "cutting-edge", "state-of-the-art", "fundamentally", "significantly",
  "substantially", "effectively", "increasingly", "moreover", "furthermore",
  "additionally", "consequently", "nevertheless", "essential", "vital",
  "key", "critical", "pivotal", "paramount", "imperative",
];

const AI_HEDGING_PHRASES = [
  "it is important to note",
  "it is worth mentioning",
  "it should be noted",
  "plays a crucial role",
  "plays a vital role",
  "in today's",
  "in the realm of",
  "in the modern world",
  "in recent years",
  "navigating the complexities",
  "the ever-evolving",
  "continues to evolve",
];

const FILLER_WORDS = [
  "honestly", "look,", "I mean,", "basically", "kinda", "sorta",
  "like,", "right?", "yeah", "tbh", "ngl", "anyway,",
];

interface ScoreBreakdown {
  triggerDensity: number;
  emDashPenalty: number;
  burstiness: number;
  contractionDensity: number;
  hedgingDensity: number;
  avgLenScore: number;
  punctVariety: number;
  fillerPresence: number;
  total: number;
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function countMatches(text: string, words: string[]): number {
  const lower = text.toLowerCase();
  let count = 0;
  for (const w of words) {
    const re = new RegExp("\\b" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "gi");
    const matches = lower.match(re);
    if (matches) count += matches.length;
  }
  return count;
}

export function scoreHumanness(text: string): ScoreBreakdown {
  const words = text.split(/\s+/).filter(Boolean);
  const wordCount = Math.max(words.length, 1);
  const sentences = splitSentences(text);
  const sentenceCount = Math.max(sentences.length, 1);

  // 1. AI trigger density — fewer is better
  const triggers = countMatches(text, AI_TRIGGER_WORDS);
  const triggerDensity = 1 - Math.min(1, triggers / Math.max(sentenceCount, 1));

  // 2. Em-dash penalty — any em-dashes is a fingerprint
  const emDashes = (text.match(/—|–/g) || []).length;
  const emDashPenalty = emDashes === 0 ? 1 : Math.max(0, 1 - emDashes * 0.3);

  // 3. Burstiness — coefficient of variation in sentence lengths
  const lens = sentences.map((s) => s.split(/\s+/).filter(Boolean).length);
  const mean = lens.reduce((a, b) => a + b, 0) / sentenceCount;
  const variance = lens.reduce((acc, l) => acc + Math.pow(l - mean, 2), 0) / sentenceCount;
  const std = Math.sqrt(variance);
  const cv = mean > 0 ? std / mean : 0;
  // CV > 0.5 = good burstiness, > 0.8 = very human
  const burstiness = Math.min(1, cv / 0.7);

  // 4. Contractions — humans use them
  const contractions = (text.match(/\b\w+'\w+\b/g) || []).length;
  const contractionDensity = Math.min(1, contractions / Math.max(sentenceCount * 0.5, 1));

  // 5. Hedging density — fewer is better
  const lower = text.toLowerCase();
  let hedgingCount = 0;
  for (const phrase of AI_HEDGING_PHRASES) {
    if (lower.includes(phrase)) hedgingCount++;
  }
  const hedgingDensity = hedgingCount === 0 ? 1 : Math.max(0, 1 - hedgingCount * 0.25);

  // 6. Average sentence length — AI clusters at 18-22, humans vary more
  // We want distance from 20, normalized
  const avgLen = wordCount / sentenceCount;
  const distFrom20 = Math.abs(avgLen - 20);
  const avgLenScore = Math.min(1, distFrom20 / 10);

  // 7. Punctuation variety — count distinct punctuation marks used
  const punctSet = new Set((text.match(/[.,;:!?()-]/g) || []));
  const punctVariety = Math.min(1, punctSet.size / 5);

  // 8. Filler presence — fillers in 2+ places = strong human signal
  const fillerCount = countMatches(text, FILLER_WORDS);
  const fillerPresence = Math.min(1, fillerCount / 2);

  const total =
    triggerDensity * 2.0 +     // heavily weighted — trigger words are red flags
    emDashPenalty * 1.5 +      // em-dashes are direct Copyleaks fingerprint
    burstiness * 1.5 +         // major Copyleaks signal
    contractionDensity * 1.0 +
    hedgingDensity * 1.0 +
    avgLenScore * 0.5 +
    punctVariety * 0.3 +
    fillerPresence * 0.5;

  return {
    triggerDensity,
    emDashPenalty,
    burstiness,
    contractionDensity,
    hedgingDensity,
    avgLenScore,
    punctVariety,
    fillerPresence,
    total,
  };
}
