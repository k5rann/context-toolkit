export interface TransformationMetric {
  label: string;
  before: string;
  after: string;
  delta: string;
}

export interface TransformationAnalysis {
  originalWordCount: number;
  revisedWordCount: number;
  wordDeltaPercent: number;
  originalSentenceCount: number;
  revisedSentenceCount: number;
  sharedContentPercent: number;
  genericBefore: number;
  genericAfter: number;
  sentenceStartOverlapPercent: number;
  addedTerms: string[];
  removedTerms: string[];
  metrics: TransformationMetric[];
  observations: string[];
}

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

const GENERIC_PATTERNS: RegExp[] = [
  /\bdelv(?:e|es|ed|ing)\b/i,
  /\btapestry\b/i,
  /\brealm\b/i,
  /\bjourney\b/i,
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
  /\bnot just\b.+\bbut also\b/i,
  /\boffers several key benefits\b/i,
];

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9'\s-]/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);
}

function contentWords(text: string): string[] {
  return words(text).filter((word) => word.length > 3 && !STOP_WORDS.has(word));
}

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function percent(n: number): string {
  return `${Math.round(n)}%`;
}

function wordCount(text: string): number {
  return words(text).length;
}

function avgSentenceLength(text: string): number {
  const parts = sentences(text);
  if (parts.length === 0) return 0;
  return parts.reduce((sum, sentence) => sum + wordCount(sentence), 0) / parts.length;
}

function uniqueRatio(items: string[]): number {
  if (items.length === 0) return 0;
  return new Set(items).size / items.length;
}

function genericHits(text: string): number {
  return GENERIC_PATTERNS.reduce(
    (sum, pattern) => sum + (pattern.test(text) ? 1 : 0),
    0
  );
}

function sentenceStarts(text: string): string[] {
  return sentences(text)
    .map((sentence) => words(sentence)[0])
    .filter(Boolean);
}

function topDifference(source: string[], target: Set<string>): string[] {
  const counts = new Map<string, number>();
  for (const word of source) {
    if (target.has(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 12)
    .map(([word]) => word);
}

export function analyzeTransformation(
  original: string,
  revised: string
): TransformationAnalysis {
  const originalWords = contentWords(original);
  const revisedWords = contentWords(revised);
  const originalSet = new Set(originalWords);
  const revisedSet = new Set(revisedWords);
  const shared =
    originalSet.size === 0
      ? 0
      : Array.from(originalSet).filter((word) => revisedSet.has(word)).length /
        originalSet.size;

  const originalStarts = new Set(sentenceStarts(original));
  const revisedStarts = sentenceStarts(revised);
  const startOverlap =
    revisedStarts.length === 0
      ? 0
      : revisedStarts.filter((start) => originalStarts.has(start)).length /
        revisedStarts.length;

  const originalWordCount = wordCount(original);
  const revisedWordCount = wordCount(revised);
  const wordDeltaPercent =
    originalWordCount === 0
      ? 0
      : ((revisedWordCount - originalWordCount) / originalWordCount) * 100;
  const genericBefore = genericHits(original);
  const genericAfter = genericHits(revised);
  const originalSentenceCount = sentences(original).length;
  const revisedSentenceCount = sentences(revised).length;
  const originalUnique = uniqueRatio(originalWords) * 100;
  const revisedUnique = uniqueRatio(revisedWords) * 100;
  const originalAvg = avgSentenceLength(original);
  const revisedAvg = avgSentenceLength(revised);

  const observations: string[] = [];
  if (Math.abs(wordDeltaPercent) > 25) {
    observations.push(
      wordDeltaPercent > 0
        ? "The revision expands heavily; check that it did not add unsupported claims."
        : "The revision compresses heavily; check that important meaning was not dropped."
    );
  }
  if (shared < 0.55) {
    observations.push("Low content overlap: this is a substantial rebuild, not a light paraphrase.");
  } else if (shared > 0.8) {
    observations.push("High content overlap: this may still be close to the original wording.");
  }
  if (genericAfter < genericBefore) {
    observations.push("Generic phrase count improved.");
  } else if (genericAfter > genericBefore) {
    observations.push("Generic phrase count got worse.");
  }
  if (startOverlap < 0.35) {
    observations.push("Sentence openings changed meaningfully.");
  } else if (startOverlap > 0.7) {
    observations.push("Sentence openings still mirror the original structure.");
  }
  if (revisedUnique > originalUnique + 8) {
    observations.push("Vocabulary variety increased.");
  }
  if (observations.length === 0) {
    observations.push("This is a moderate edit. Compare the details before trusting it.");
  }

  return {
    originalWordCount,
    revisedWordCount,
    wordDeltaPercent,
    originalSentenceCount,
    revisedSentenceCount,
    sharedContentPercent: shared * 100,
    genericBefore,
    genericAfter,
    sentenceStartOverlapPercent: startOverlap * 100,
    addedTerms: topDifference(revisedWords, originalSet),
    removedTerms: topDifference(originalWords, revisedSet),
    metrics: [
      {
        label: "Word count",
        before: String(originalWordCount),
        after: String(revisedWordCount),
        delta: `${wordDeltaPercent >= 0 ? "+" : ""}${Math.round(wordDeltaPercent)}%`,
      },
      {
        label: "Sentences",
        before: String(originalSentenceCount),
        after: String(revisedSentenceCount),
        delta: `${revisedSentenceCount - originalSentenceCount >= 0 ? "+" : ""}${
          revisedSentenceCount - originalSentenceCount
        }`,
      },
      {
        label: "Avg sentence",
        before: `${originalAvg.toFixed(1)}w`,
        after: `${revisedAvg.toFixed(1)}w`,
        delta: `${revisedAvg - originalAvg >= 0 ? "+" : ""}${(revisedAvg - originalAvg).toFixed(1)}w`,
      },
      {
        label: "Content overlap",
        before: "baseline",
        after: percent(shared * 100),
        delta: shared > 0.75 ? "close" : shared > 0.55 ? "moderate" : "rebuilt",
      },
      {
        label: "Generic phrases",
        before: String(genericBefore),
        after: String(genericAfter),
        delta: `${genericAfter - genericBefore >= 0 ? "+" : ""}${genericAfter - genericBefore}`,
      },
      {
        label: "Sentence starts",
        before: "baseline",
        after: percent(startOverlap * 100),
        delta: startOverlap > 0.65 ? "mirrors" : startOverlap > 0.35 ? "mixed" : "changed",
      },
    ],
    observations,
  };
}
