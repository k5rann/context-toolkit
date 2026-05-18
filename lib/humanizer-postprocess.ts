/**
 * Post-processing pipeline for humanized text.
 *
 * Applies deterministic transforms AFTER LLM rewrite to break
 * the statistical patterns that AI detectors (Copyleaks, GPTZero) flag:
 *
 *   1. Perplexity injection — replace predictable words with less common alternatives
 *   2. Burstiness injection — vary sentence length/complexity
 *   3. Structural disruption — clause reordering, voice flipping, connector changes
 *   4. Surface noise — contractions, filler words, punctuation variation
 */

// ── 1. CONTRACTION FORCING ──────────────────────────────────────────────

const CONTRACTION_MAP: [RegExp, string][] = [
  [/\bI am\b/g, "I'm"],
  [/\bI have\b/g, "I've"],
  [/\bI will\b/g, "I'll"],
  [/\bI would\b/g, "I'd"],
  [/\bwe are\b/g, "we're"],
  [/\bwe have\b/g, "we've"],
  [/\bwe will\b/g, "we'll"],
  [/\bthey are\b/g, "they're"],
  [/\bthey have\b/g, "they've"],
  [/\bthey will\b/g, "they'll"],
  [/\bthere is\b/g, "there's"],
  [/\bthere are\b/g, "there're"],
  [/\bthat is\b/g, "that's"],
  [/\bthat has\b/g, "that's"],
  [/\bit is\b/g, "it's"],
  [/\bit has\b/g, "it's"],
  [/\bit will\b/g, "it'll"],
  [/\bwhat is\b/g, "what's"],
  [/\bwho is\b/g, "who's"],
  [/\bwhere is\b/g, "where's"],
  [/\bhow is\b/g, "how's"],
  [/\bdo not\b/g, "don't"],
  [/\bdoes not\b/g, "doesn't"],
  [/\bdid not\b/g, "didn't"],
  [/\bis not\b/g, "isn't"],
  [/\bare not\b/g, "aren't"],
  [/\bwas not\b/g, "wasn't"],
  [/\bwere not\b/g, "weren't"],
  [/\bwill not\b/g, "won't"],
  [/\bwould not\b/g, "wouldn't"],
  [/\bcould not\b/g, "couldn't"],
  [/\bshould not\b/g, "shouldn't"],
  [/\bcan not\b/g, "can't"],
  [/\bcannot\b/g, "can't"],
  [/\bhas not\b/g, "hasn't"],
  [/\bhave not\b/g, "haven't"],
  [/\bhad not\b/g, "hadn't"],
  [/\bneed not\b/g, "needn't"],
  [/\blet us\b/g, "let's"],
];

function forceContractions(text: string): string {
  let out = text;
  for (const [pattern, replacement] of CONTRACTION_MAP) {
    out = out.replace(pattern, replacement);
  }
  // Case-insensitive versions for sentence starts
  for (const [pattern, replacement] of CONTRACTION_MAP) {
    const src = pattern.source;
    const upper = src.charAt(2).toUpperCase() + src.slice(3);
    const rep = replacement.charAt(0).toUpperCase() + replacement.slice(1);
    out = out.replace(new RegExp("\\b" + upper, "g"), rep);
  }
  return out;
}

// ── 2. SENTENCE SPLITTING/MERGING (burstiness) ─────────────────────────

function splitSentences(text: string): string[] {
  const abbrevs =
    /(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|e\.g|i\.e|U\.S|U\.K)\./gi;
  const placeholder = "§ABBR§";
  let safe = text.replace(abbrevs, (m) => m.replace(".", placeholder));
  const raw = safe
    .split(/(?<=[.!?])\s+/)
    .map((s) =>
      s.replace(new RegExp(placeholder.replace(/[§]/g, "\\§"), "g"), ".")
    )
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return raw;
}

/** Split long sentences (>25 words) at natural break points */
function splitLongSentences(sentences: string[]): string[] {
  const result: string[] = [];
  for (const s of sentences) {
    const words = s.split(/\s+/);
    if (words.length <= 25) {
      result.push(s);
      continue;
    }
    // Try splitting at ", which", ", and", ", but", ", so", ", while"
    const splitPatterns = [
      /,\s+which\s/i,
      /,\s+and\s/i,
      /,\s+but\s/i,
      /,\s+so\s/i,
      /,\s+while\s/i,
      /,\s+allowing\s/i,
      /,\s+enabling\s/i,
      /,\s+making\s/i,
    ];
    let didSplit = false;
    for (const pat of splitPatterns) {
      const match = s.match(pat);
      if (match && match.index) {
        const idx = match.index;
        const first = s.slice(0, idx).trim() + ".";
        let second = s.slice(idx + match[0].length).trim();
        // Capitalize first letter
        second = second.charAt(0).toUpperCase() + second.slice(1);
        // Ensure it ends with period
        if (!/[.!?]$/.test(second)) second += ".";
        result.push(first, second);
        didSplit = true;
        break;
      }
    }
    if (!didSplit) result.push(s);
  }
  return result;
}

/** Merge adjacent very short sentences (< 7 words each) */
function mergeShortSentences(sentences: string[]): string[] {
  const result: string[] = [];
  const connectors = [", and ", ", so ", ", meaning ", " and "];
  let i = 0;
  while (i < sentences.length) {
    const curr = sentences[i];
    const next = sentences[i + 1];
    const currWords = curr.split(/\s+/).length;
    const nextWords = next ? next.split(/\s+/).length : 999;

    if (currWords < 7 && nextWords < 7 && next) {
      // Merge with a random connector
      const conn = connectors[i % connectors.length];
      const merged = curr.replace(/[.!?]$/, "") + conn + next.charAt(0).toLowerCase() + next.slice(1);
      result.push(merged);
      i += 2;
    } else {
      result.push(curr);
      i++;
    }
  }
  return result;
}

// ── 3. VOCABULARY PERTURBATION ──────────────────────────────────────────

// Map of AI-predictable words → less predictable human alternatives
// These aren't just synonyms — they're register shifts
const VOCAB_SWAPS: [RegExp, string[]][] = [
  // AI verbs
  [/\benables?\b/gi, ["lets", "gives ... the ability to", "means ... can"]],
  [/\bensures?\b/gi, ["makes sure", "keeps"]],
  [/\brequires?\b/gi, ["needs", "calls for"]],
  [/\bdemonstrates?\b/gi, ["shows", "proves"]],
  [/\bindicates?\b/gi, ["points to", "shows", "suggests"]],
  [/\bprovides?\b/gi, ["gives", "offers", "hands"]],
  [/\bidentif(?:y|ies)\b/gi, ["spots", "finds", "picks out", "catches"]],
  [/\bprocess(?:es)?\b/gi, ["handle", "chew through", "work through", "crunch"]],
  [/\bmitigat(?:e|es)\b/gi, ["reduce", "cut down on", "deal with"]],
  [/\bimplement(?:s|ed)?\b/gi, ["set up", "put in place", "roll out"]],
  [/\bintegrat(?:e|es|ion)\b/gi, ["bake in", "build in", "fold in", "adding"]],

  // AI adjectives
  [/\bsignificant(?:ly)?\b/gi, ["big", "a lot", "real", "serious"]],
  [/\bsubstantial(?:ly)?\b/gi, ["a lot", "serious", "real"]],
  [/\beffective(?:ly)?\b/gi, ["well", "actually", "for real"]],
  [/\brapid(?:ly)?\b/gi, ["fast", "quick"]],
  [/\bseamless(?:ly)?\b/gi, ["smooth", "easy"]],
  [/\bvast\b/gi, ["huge", "massive", "tons of"]],
  [/\bincreasingly\b/gi, ["more and more"]],
  [/\bpotential\b/gi, ["possible"]],

  // AI nouns/phrases
  [/\bcapabilities\b/gi, ["ability", "what it can do", "features"]],
  [/\blandscape\b/gi, ["world", "space", "scene"]],
  [/\bposture\b/gi, ["setup", "situation", "shape"]],
  [/\bframework\b/gi, ["system", "setup", "approach"]],
  [/\becosystem\b/gi, ["space", "world"]],

  // AI transitions (replace with casual ones or nothing)
  [/\bFurthermore,?\s*/gi, ["Also, ", "Plus, ", "And ", "On top of that, "]],
  [/\bMoreover,?\s*/gi, ["Also, ", "Plus, ", ""]],
  [/\bAdditionally,?\s*/gi, ["Also, ", "And ", ""]],
  [/\bConsequently,?\s*/gi, ["So ", "That means ", ""]],
  [/\bNevertheless,?\s*/gi, ["Still, ", "But ", ""]],
  [/\bHowever,?\s*/gi, ["But ", "Though, ", "That said, "]],

  // AI hedging phrases
  [/\bIt is (?:important|worth) (?:to note|noting|mentioning) that\s*/gi, [""]],
  [/\bIt should be noted that\s*/gi, [""]],
  [/\bplays a (?:crucial|vital|key) role in\b/gi, ["matters for", "helps with"]],
  [/\bin today'?s\s+(?:world|age|era|society)\b/gi, ["now", "these days", "right now"]],
  [/\bin the realm of\b/gi, ["in", "with"]],
];

/** Deterministic but varied — pick replacement based on sentence position */
function perturbVocab(text: string, seed: number): string {
  let out = text;
  let swapCount = 0;
  for (const [pattern, replacements] of VOCAB_SWAPS) {
    out = out.replace(pattern, (match) => {
      const pick = replacements[(seed + swapCount) % replacements.length];
      swapCount++;
      // Preserve original capitalization if at sentence start
      if (match.charAt(0) === match.charAt(0).toUpperCase() && pick.length > 0) {
        return pick.charAt(0).toUpperCase() + pick.slice(1);
      }
      return pick;
    });
  }
  return out;
}

// ── 4. FILLER / DISCOURSE MARKER INJECTION ──────────────────────────────

const FILLERS = [
  "honestly, ",
  "look, ",
  "I mean, ",
  "basically, ",
  "the thing is, ",
  "here's the deal: ",
  "real talk, ",
];

const SENTENCE_STARTERS = [
  "So ",
  "And ",
  "But ",
  "Thing is, ",
  "Point being, ",
  "Bottom line, ",
];

/** Inject fillers at ~20% of sentences (every 5th sentence), skip short fragments */
function injectFillers(sentences: string[], seed: number): string[] {
  return sentences.map((s, i) => {
    const words = s.split(/\s+/).length;
    // Only inject on sentences with 8+ words — fillers on fragments sound wrong
    if (i > 0 && (i + seed) % 5 === 0 && words >= 8) {
      const filler = FILLERS[(i + seed) % FILLERS.length];
      return filler + s.charAt(0).toLowerCase() + s.slice(1);
    }
    return s;
  });
}

/** Vary sentence openers — if two adjacent sentences start with the same word, change the second */
function varySentenceOpeners(sentences: string[], seed: number): string[] {
  const result = [...sentences];
  for (let i = 1; i < result.length; i++) {
    const prevStart = result[i - 1].split(/\s/)[0].toLowerCase();
    const currStart = result[i].split(/\s/)[0].toLowerCase();
    if (prevStart === currStart) {
      const starter = SENTENCE_STARTERS[(i + seed) % SENTENCE_STARTERS.length];
      result[i] = starter + result[i].charAt(0).toLowerCase() + result[i].slice(1);
    }
  }
  return result;
}

// ── 5. PASSIVE → ACTIVE VOICE ───────────────────────────────────────────

/** Simple passive voice detection and flagging (not full conversion — that needs NLP) */
function reducePassiveVoice(text: string): string {
  // Remove common passive constructions that add nothing
  return text
    .replace(/\bis being\s+(\w+ed)\b/gi, "$1")
    .replace(/\bcan be\s+(\w+ed)\b/gi, "can $1")
    .replace(/\bare being\s+(\w+ed)\b/gi, "get $1");
}

// ── 6. ADVERB STRIPPING ────────────────────────────────────────────────

const AI_ADVERBS = /\b(?:significantly|substantially|effectively|continuously|fundamentally|dramatically|increasingly|remarkably|precisely|seamlessly|efficiently|meticulously|comprehensively)\b,?\s*/gi;

function stripAIAdverbs(text: string): string {
  return text.replace(AI_ADVERBS, "");
}

// ── 7. PARAGRAPH BREAK VARIATION ────────────────────────────────────────

/** Add paragraph breaks in long blocks to create visual burstiness */
function varyParagraphs(sentences: string[]): string {
  if (sentences.length <= 3) return sentences.join(" ");

  const chunks: string[][] = [];
  let current: string[] = [];

  for (let i = 0; i < sentences.length; i++) {
    current.push(sentences[i]);
    // Break every 2-4 sentences (varied)
    const breakAt = (i % 3 === 0) ? 2 : (i % 3 === 1) ? 3 : 4;
    if (current.length >= breakAt && i < sentences.length - 1) {
      chunks.push(current);
      current = [];
    }
  }
  if (current.length) chunks.push(current);

  return chunks.map((c) => c.join(" ")).join("\n\n");
}

// ── MAIN PIPELINE ───────────────────────────────────────────────────────

export interface PostProcessOptions {
  /** Seed for deterministic variation (use sentence index, timestamp, etc.) */
  seed?: number;
  /** Enable filler injection (default: true) */
  fillers?: boolean;
  /** Enable sentence splitting/merging (default: true) */
  burstiness?: boolean;
  /** Enable paragraph break variation (default: true) */
  paragraphs?: boolean;
  /** Enable vocabulary perturbation (default: true) */
  vocabPerturb?: boolean;
}

export function postProcess(
  text: string,
  options: PostProcessOptions = {}
): string {
  const {
    seed = Date.now() % 1000,
    fillers = true,
    burstiness = true,
    paragraphs = true,
    vocabPerturb = true,
  } = options;

  // Step 0: Kill em-dashes (major AI fingerprint)
  let processed = text
    .replace(/\s*—\s*/g, ". ")
    .replace(/\s*–\s*/g, ", ")
    // Collapse double spaces and spaces before punctuation (artifact cleanup)
    .replace(/ {2,}/g, " ")
    .replace(/ ([.,;:!?])/g, "$1");

  // Step 1: Strip AI adverbs
  processed = stripAIAdverbs(processed);

  // Step 2: Vocabulary perturbation
  if (vocabPerturb) {
    processed = perturbVocab(processed, seed);
  }

  // Step 3: Force contractions
  processed = forceContractions(processed);

  // Step 4: Reduce passive voice
  processed = reducePassiveVoice(processed);

  // Step 5: Split into sentences for structural transforms
  let sentences = splitSentences(processed);

  // Step 6: Burstiness — split long, merge short
  if (burstiness) {
    sentences = splitLongSentences(sentences);
    sentences = mergeShortSentences(sentences);
  }

  // Step 7: Vary sentence openers
  sentences = varySentenceOpeners(sentences, seed);

  // Step 8: Inject fillers
  if (fillers) {
    sentences = injectFillers(sentences, seed);
  }

  // Step 9: Paragraph breaks
  let final = paragraphs ? varyParagraphs(sentences) : sentences.join(" ");

  // Step 10: Final artifact cleanup — double spaces, space-before-punctuation
  final = final.replace(/ {2,}/g, " ").replace(/ ([.,;:!?])/g, "$1");

  return final;
}
