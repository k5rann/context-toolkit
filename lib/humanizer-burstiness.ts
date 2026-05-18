export interface BurstinessStats {
  count: number;
  mean: number;
  std: number;
  cv: number;
  histogram: number[];
}

export interface BurstinessOptions {
  targetCV?: number;
  maxAggression?: number;
}

const DOT = "__HUMANIZER_DOT__";
const NON_BOUNDARY_ABBREVIATIONS = [
  "Mr.",
  "Mrs.",
  "Ms.",
  "Dr.",
  "Prof.",
  "Sr.",
  "Jr.",
  "St.",
  "vs.",
  "etc.",
  "e.g.",
  "i.e.",
  "a.m.",
  "p.m.",
  "No.",
  "Fig.",
  "Inc.",
  "Ltd.",
  "Co.",
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function protectAbbreviations(text: string): string {
  let output = text;

  for (const abbr of NON_BOUNDARY_ABBREVIATIONS) {
    output = output.replace(
      new RegExp(escapeRegExp(abbr), "g"),
      abbr.replace(/\./g, DOT)
    );
  }

  return output.replace(/\b(?:[A-Z]\.){2,}/g, (match) => {
    const lastDot = match.lastIndexOf(".");
    return (
      match.slice(0, lastDot).replace(/\./g, DOT) + match.slice(lastDot)
    );
  });
}

function restoreAbbreviations(text: string): string {
  return text.replaceAll(DOT, ".");
}

function nextNonSpace(text: string, index: number): string {
  for (let i = index; i < text.length; i += 1) {
    if (!/\s/.test(text[i])) return text[i];
  }
  return "";
}

function splitSentencesWithText(text: string): string[] {
  const protectedText = protectAbbreviations(text.trim());
  const parts: string[] = [];
  let start = 0;

  for (let i = 0; i < protectedText.length; i += 1) {
    const char = protectedText[i];
    if (char !== "." && char !== "!" && char !== "?") continue;

    let end = i + 1;
    while (end < protectedText.length && /["')\]]/.test(protectedText[end])) {
      end += 1;
    }

    const next = nextNonSpace(protectedText, end);
    if (next && !/[A-Z0-9"']/.test(next)) continue;

    const sentence = protectedText.slice(start, end).trim();
    if (sentence) parts.push(restoreAbbreviations(sentence));

    while (end < protectedText.length && /\s/.test(protectedText[end])) {
      end += 1;
    }
    start = end;
    i = end - 1;
  }

  const tail = protectedText.slice(start).trim();
  if (tail) parts.push(restoreAbbreviations(tail));

  return parts;
}

function wordCount(text: string): number {
  return (text.match(/[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*/g) ?? []).length;
}

function stddev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) /
    values.length;
  return Math.sqrt(variance);
}

export function sentenceLengths(text: string): number[] {
  return splitSentencesWithText(text)
    .map((sentence) => wordCount(sentence))
    .filter((count) => count > 0);
}

export function measureBurstiness(text: string): BurstinessStats {
  const lengths = sentenceLengths(text);
  const count = lengths.length;
  const mean =
    count === 0 ? 0 : lengths.reduce((sum, value) => sum + value, 0) / count;
  const std = stddev(lengths);
  const cv = mean === 0 ? 0 : std / mean;
  const histogram = [0, 0, 0, 0, 0, 0];

  for (const length of lengths) {
    if (length < 5) histogram[0] += 1;
    else if (length < 10) histogram[1] += 1;
    else if (length < 15) histogram[2] += 1;
    else if (length < 25) histogram[3] += 1;
    else if (length < 40) histogram[4] += 1;
    else histogram[5] += 1;
  }

  return { count, mean, std, cv, histogram };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function stripTerminal(sentence: string): string {
  return sentence.trim().replace(/[.!?]+["')\]]*$/g, "").trim();
}

function sentenceEnd(sentence: string): string {
  const match = sentence.trim().match(/[.!?]+["')\]]*$/);
  return match ? match[0] : ".";
}

function capitalizeFirst(text: string): string {
  return text.replace(/^([a-z])/, (match) => match.toUpperCase());
}

function lowercaseFirst(text: string): string {
  if (/^[A-Z]{2}\b/.test(text)) return text;
  return text.replace(/^([A-Z])/, (match) => match.toLowerCase());
}

function splitForFragment(sentence: string): { fragment: string; tail: string } | null {
  const clean = stripTerminal(sentence);
  const tokens = clean.match(/\S+/g) ?? [];
  if (tokens.length < 12) return null;

  let splitAt = -1;
  let seenWords = 0;
  const rawTokens = clean.split(/(\s+)/);
  const weakFragmentEnd = new Set([
    "a",
    "an",
    "and",
    "are",
    "as",
    "because",
    "be",
    "been",
    "being",
    "but",
    "by",
    "for",
    "from",
    "in",
    "is",
    "not",
    "of",
    "or",
    "that",
    "the",
    "to",
    "was",
    "we",
    "were",
    "with",
  ]);
  const weakTailStart = new Set(["am", "are", "be", "been", "being", "is", "was", "were"]);

  function splitLooksReadable(index: number): boolean {
    const fragment = rawTokens.slice(0, index).join("").replace(/[,;:]+$/, "").trim();
    const tail = rawTokens.slice(index).join("").replace(/^[-,;:\s]+/, "").trim();
    const fragmentWords = fragment.match(/[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*/g) ?? [];
    const tailWords = tail.match(/[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*/g) ?? [];
    const lastFragmentWord = fragmentWords.at(-1)?.toLowerCase() ?? "";
    const firstTailWord = tailWords[0]?.toLowerCase() ?? "";

    return (
      fragmentWords.length >= 3 &&
      fragmentWords.length <= 7 &&
      tailWords.length >= 4 &&
      !weakFragmentEnd.has(lastFragmentWord) &&
      !weakTailStart.has(firstTailWord)
    );
  }

  for (let i = 0; i < rawTokens.length; i += 1) {
    if (/^\s+$/.test(rawTokens[i])) continue;
    seenWords += 1;
    if (
      seenWords >= 3 &&
      seenWords <= 7 &&
      /[,;:]$/.test(rawTokens[i]) &&
      splitLooksReadable(i + 1)
    ) {
      splitAt = i + 1;
      break;
    }
  }

  if (splitAt === -1) {
    for (const targetWords of [5, 6, 7, 4, 3]) {
      seenWords = 0;
      for (let i = 0; i < rawTokens.length; i += 1) {
        if (/^\s+$/.test(rawTokens[i])) continue;
        seenWords += 1;
        if (seenWords === targetWords && splitLooksReadable(i + 1)) {
          splitAt = i + 1;
          break;
        }
      }
      if (splitAt !== -1) {
        break;
      }
    }
  }

  if (splitAt === -1) return null;

  const fragment = rawTokens.slice(0, splitAt).join("").replace(/[,;:]+$/, "").trim();
  const tail = rawTokens.slice(splitAt).join("").replace(/^[-,;:\s]+/, "").trim();

  if (wordCount(fragment) < 3 || wordCount(fragment) > 7) return null;
  if (wordCount(tail) < 4) return null;

  return { fragment, tail };
}

function connectorFor(index: number): string {
  return ["and", "but", "because"][index % 3];
}

function joinCompound(parts: string[], connectorIndex: number): string {
  const connector = connectorFor(connectorIndex);
  const [first, ...rest] = parts.map(stripTerminal);
  let output = capitalizeFirst(first);

  for (const part of rest) {
    output += `, ${connector} ${lowercaseFirst(part)}`;
  }

  return `${output}${sentenceEnd(parts[parts.length - 1])}`;
}

function collectCompound(
  sentences: string[],
  start: number,
  minWords: number,
  maxWords: number,
  maxSentences: number
): { parts: string[]; wordTotal: number } | null {
  const parts: string[] = [];
  let wordTotal = 0;

  for (
    let i = start;
    i < sentences.length && parts.length < maxSentences;
    i += 1
  ) {
    const sentence = sentences[i];
    const length = wordCount(sentence);
    if (length > 30) break;

    if (wordTotal + length > maxWords) break;

    parts.push(sentence);
    wordTotal += length;

    if (wordTotal >= minWords && parts.length >= 2) {
      return { parts, wordTotal };
    }
  }

  return null;
}

function transformParagraph(
  paragraph: string,
  targetCV: number,
  maxAggression: number
): string {
  const sentences = splitSentencesWithText(paragraph);
  if (sentences.length < 3) return paragraph;

  const transformed: string[] = [];
  const maxTransforms = Math.max(
    1,
    Math.ceil(
      sentences.length * (0.14 + maxAggression * 0.18)
    )
  );
  let transforms = 0;

  for (let i = 0; i < sentences.length; i += 1) {
    const current = sentences[i];
    const next = sentences[i + 1];
    const currentLength = wordCount(current);
    const nextLength = next ? wordCount(next) : 0;

    if (
      transforms < maxTransforms &&
      measureBurstiness([...transformed, ...sentences.slice(i)].join(" ")).cv <
        targetCV &&
      next &&
      currentLength >= 12 &&
      currentLength <= 25 &&
      nextLength >= 5 &&
      nextLength <= 30
    ) {
      const split = splitForFragment(current);
      if (split) {
        const collected = collectCompound(sentences, i + 1, 16, 42, 3);
        const compoundLength =
          wordCount(split.tail) + (collected?.wordTotal ?? nextLength);
        if (collected && compoundLength >= 24 && compoundLength <= 52) {
          const fragment = `${capitalizeFirst(split.fragment)}.`;
          const compound = joinCompound(
            [split.tail, ...collected.parts],
            transforms
          );
          transformed.push(fragment, compound);
          transforms += 1;
          i += collected.parts.length;
          continue;
        }
      }
    }

    if (
      transforms < maxTransforms &&
      measureBurstiness([...transformed, ...sentences.slice(i)].join(" ")).cv <
        targetCV &&
      currentLength >= 3 &&
      currentLength <= 7 &&
      next
    ) {
      const collected = collectCompound(sentences, i + 1, 24, 48, 5);
      if (collected) {
        transformed.push(current, joinCompound(collected.parts, transforms));
        transforms += 1;
        i += collected.parts.length;
        continue;
      }
    }

    if (
      transforms < maxTransforms &&
      measureBurstiness([...transformed, ...sentences.slice(i)].join(" ")).cv <
        targetCV &&
      currentLength >= 8 &&
      currentLength <= 11 &&
      next
    ) {
      const collected = collectCompound(sentences, i, 28, 48, 5);
      if (collected) {
        transformed.push(joinCompound(collected.parts, transforms));
        transforms += 1;
        i += collected.parts.length - 1;
        continue;
      }
    }

    transformed.push(current);
  }

  return transformed.join(" ");
}

export function injectBurstiness(
  text: string,
  opts: BurstinessOptions = {}
): string {
  const targetCV = opts.targetCV ?? 0.65;
  const maxAggression = clamp01(opts.maxAggression ?? 0.7);
  const baseline = measureBurstiness(text);

  if (baseline.count < 3 || baseline.cv >= targetCV) return text;

  return text
    .split(/(\n{2,})/)
    .map((part) =>
      /^\n{2,}$/.test(part)
        ? part
        : transformParagraph(part, targetCV, maxAggression)
    )
    .join("");
}
