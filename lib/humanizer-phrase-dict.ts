// Phrase dictionary: lexical swaps that move text away from AI-detector
// fingerprints toward plainer register. Seeded from stealthwriter A/B
// pairs (research/phrase-chase/) where Pair 01 was Copyleaks-verified at
// 0% AI. Pairs 02-06 are candidate patterns only.
//
// Two design rules:
//   1. Never swap toward a word already on humanizer.ts's GENERIC_PATTERNS
//      banned list. Stealthwriter sometimes does (e.g. Furthermore →
//      Moreover); we don't.
//   2. Apply longer multi-word idioms before single-word swaps so the
//      idiom rule wins.

export interface PhraseDictOptions {
  swapTransitions?: boolean;
  swapVocab?: boolean;
  swapIdioms?: boolean;
}

export interface PhraseSwapCounts {
  transitions: number;
  vocab: number;
  idioms: number;
  total: number;
}

type Replacement = string | ((match: string, ...args: unknown[]) => string);
type SwapPair = readonly [RegExp, Replacement];

// Tier 2 idioms — multi-word, applied first.
const IDIOMS: ReadonlyArray<SwapPair> = [
  [/\bunlocked unprecedented opportunities for\b/gi, "opened up new horizons for"],
  [/\bin today's rapidly evolving digital landscape\b/gi, "in today's fast-changing digital world"],
  [/\bin today's competitive landscape\b/gi, "in today's market"],
  [/\bin today's fast-paced world\b/gi, "with today's busy lifestyle"],
  [/\bin today's digital age\b/gi, "in today's tech-heavy era"],
  [/\bin the modern digital age\b/gi, "in today's tech-heavy era"],
  [/\belevate (their|the|our) market presence\b/gi, "take $1 market presence to the next level"],
  [/\bdeep understanding of\b/gi, "know-how about"],
  [/\bover time\b/gi, "in the long run"],
  [/\byield(?:s|ed)? the most meaningful results\b/gi, "have the greatest impact"],
  [/\byield(?:s|ed)? meaningful results\b/gi, "have real impact"],
  [/\bsignificantly enhance(?:s|d)?\b/gi, "make a huge difference to"],
  [/\bit'?s important to note that\b/gi, "keep in mind that"],
  [/\bit'?s worth noting that\b/gi, "keep in mind that"],
  [/\bit is essential to recognize that\b/gi, "it's important to understand that"],
  [/\bit is crucial that\b/gi, "it's essential that"],
  [/\bwe believe that\b/gi, ""],
  [/\bat the end of the day\b/gi, "in the end"],
  [/\bregardless of how\b/gi, "no matter how"],
  [/\bvast quantities of\b/gi, "large amounts of"],
  [/\bvirtually every\b/gi, "almost every"],
  [/\bfundamentally reshaping\b/gi, "changing"],
  [/\bcontinue(?:s|d)? to advance at an exponential rate\b/gi, "keep advancing at a growing speed"],
  [/\brevolutionary hydration companion\b/gi, "game-changer for hydration"],
  [/\bhas come to the forefront of\b/gi, "has recently entered the mainstream of"],
  // Auxiliary + emerged-as collapses: must run before single-word
  // `\bemerged as\b → is` to avoid leaving an orphan "has".
  [/\b(?:has|have|had)\s+emerged as\b/gi, "is"],
];

// Tier 1 transitions — opener and connective swaps.
const TRANSITIONS: ReadonlyArray<SwapPair> = [
  [/\bFurthermore,\s*/g, "Also, "],
  [/\bfurthermore,\s*/g, "also, "],
  [/\bMoreover,\s*/g, "Also, "],
  [/\bmoreover,\s*/g, "also, "],
  [/\bAdditionally,\s*/g, "Plus, "],
  [/\badditionally,\s*/g, "plus, "],
  [/\bTherefore,\s*/g, "So, "],
  [/\btherefore,\s*/g, "so, "],
  [/\bUltimately,\s*/g, "In the end, "],
  [/\bultimately,\s*/g, "in the end, "],
  [/\bHowever,\s*/g, "But "],
  [/\bhowever,\s*/g, "but "],
  [/\bConsequently,\s*/g, "So, "],
  [/\bconsequently,\s*/g, "so, "],
];

// Tier 1 vocab — single-word and short-phrase register downgrades.
// Each entry has been seen as a target (or near-target) in stealthwriter
// pairs AND its source is either flagged by GENERIC_PATTERNS or a clear
// AI register marker.
const VOCAB: ReadonlyArray<SwapPair> = [
  [/\bsophisticated\b/gi, "complex"],
  [/\bstreamlined\b/gi, "optimized"],
  [/\benhanced\b/gi, "improved"],
  [/\benhance\b/gi, "improve"],
  [/\brobust\b/gi, "strong"],
  [/\bmultifaceted\b/gi, "broad"],
  [/\bcomprehensive\b/gi, "overall"],
  [/\bmalicious actors\b/gi, "bad actors"],
  [/\bmalicious\b/gi, "bad"],
  [/\bvulnerabilities\b/gi, "weaknesses"],
  [/\bcontinuously\b/gi, "constantly"],
  [/\bregardless\b/gi, "no matter"],
  [/\bfostering\b/gi, "encouraging"],
  [/\bfosters\b/gi, "encourages"],
  [/\bfoster\b/gi, "encourage"],
  [/\bfostered\b/gi, "encouraged"],
  [/\bcutting-edge\b/gi, "latest"],
  [/\bstate-of-the-art\b/gi, "latest"],
  [/\bleveraging\b/gi, "using"],
  [/\bleverages\b/gi, "uses"],
  [/\bleverage\b/gi, "use"],
  [/\btransformative\b/gi, "game-changing"],
  [/\brevolutionary\b/gi, "game-changing"],
  [/\binnovative\b/gi, "new"],
  [/\bemerged as\b/gi, "is"],
  [/\bmaintaining\b/gi, "taking care of"],
  [/\brecogniz(e|es|ed|ing)\b/gi, (_m: string, ...a: unknown[]) => {
    const t = a[0] as string;
    return `understand${t === "es" ? "s" : t === "ing" ? "ing" : ""}`;
  }],
  [/\bessential\b/gi, "important"],
  [/\bnecessity\b/gi, "requirement"],
  [/\bluxury\b/gi, "privilege"],
  [/\bincorporating\b/gi, "having"],
  [/\bprioritiz(e|es|ed|ing)\b/gi, (_m: string, ...a: unknown[]) => {
    const t = a[0] as string;
    return t === "ing" ? "emphasizing" : t === "ed" ? "emphasized" : t === "es" ? "emphasizes" : "emphasize";
  }],
  [/\bdisconnect\b/gi, "switch off"],
  [/\bunderscore(?:s|d)?\b/gi, (m: string) => m.endsWith("d") ? "showed" : "shows"],
  [/\bempower(?:s|ed|ing)?\b/gi, (m: string) => {
    if (m.endsWith("ing")) return "helping";
    if (m.endsWith("ed")) return "helped";
    if (m.endsWith("s")) return "helps";
    return "help";
  }],
  [/\bgroundbreaking\b/gi, "new"],
  [/\bimpactful\b/gi, "meaningful"],
  [/\bnuanced\b/gi, "subtle"],
  [/\bpivotal\b/gi, "key"],
  [/\bparamount\b/gi, "essential"],
  [/\bseamless\b/gi, "smooth"],
  [/\bholistic\b/gi, "overall"],
];

function preserveCase(matched: string, replacement: string): string {
  if (!matched || !replacement) return replacement;
  if (matched[0] === matched[0].toUpperCase() && matched[0] !== matched[0].toLowerCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

function applyPairs(
  text: string,
  pairs: ReadonlyArray<SwapPair>
): { text: string; count: number } {
  let output = text;
  let count = 0;
  for (const [pattern, replacement] of pairs) {
    output = output.replace(pattern, (match: string, ...args: unknown[]) => {
      count += 1;
      let computed: string;
      if (typeof replacement === "function") {
        computed = (replacement as (m: string, ...a: unknown[]) => string)(match, ...args);
      } else {
        // Resolve $1, $2 backreferences against capture groups in args.
        // args is [...captures, offset, fullString] (and possibly groups).
        const captures = args.filter((a) => typeof a === "string");
        computed = replacement.replace(/\$(\d+)/g, (_full, n: string) => {
          const cap = captures[Number(n) - 1];
          return typeof cap === "string" ? cap : "";
        });
      }
      return preserveCase(match, computed);
    });
  }
  return { text: output, count };
}

// Words starting with a vowel sound when "a/an" is the article. Handles
// the common cases that our swap targets produce (overall, important,
// improved, etc.). Doesn't try to be perfect for h-aspirate or u-as-yu.
const VOWEL_SOUND_RE = /^[aeiouAEIOU]/;

function fixIndefiniteArticles(text: string): string {
  return text
    .replace(/\b(a)(\s+)([A-Za-z][\w-]*)/g, (m, art, sp, word) => {
      if (art !== "a" && art !== "A") return m;
      return VOWEL_SOUND_RE.test(word) ? `${art === "A" ? "An" : "an"}${sp}${word}` : m;
    })
    .replace(/\b(an)(\s+)([A-Za-z][\w-]*)/g, (m, art, sp, word) => {
      return VOWEL_SOUND_RE.test(word) ? m : `${art === "An" ? "A" : "a"}${sp}${word}`;
    });
}

function recapitalizeSentences(text: string): string {
  return text.replace(/(^|[.!?]\s+)([a-z])/g, (_m, prefix: string, ch: string) =>
    prefix + ch.toUpperCase()
  );
}

export function injectPhraseDict(
  text: string,
  opts: PhraseDictOptions = {}
): string {
  const { swapIdioms = true, swapVocab = true, swapTransitions = true } = opts;
  let output = text;

  if (swapIdioms) output = applyPairs(output, IDIOMS).text;
  if (swapVocab) output = applyPairs(output, VOCAB).text;
  if (swapTransitions) output = applyPairs(output, TRANSITIONS).text;

  output = output.replace(/ {2,}/g, " ").replace(/\s+([,.;:])/g, "$1");
  output = fixIndefiniteArticles(output);
  output = recapitalizeSentences(output);
  return output;
}

export function countSwaps(text: string): PhraseSwapCounts {
  const idiomCount = applyPairs(text, IDIOMS).count;
  const vocabCount = applyPairs(text, VOCAB).count;
  const transitionCount = applyPairs(text, TRANSITIONS).count;
  return {
    idioms: idiomCount,
    vocab: vocabCount,
    transitions: transitionCount,
    total: idiomCount + vocabCount + transitionCount,
  };
}
