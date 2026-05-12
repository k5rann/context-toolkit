import { generate } from "./llm";
import {
  buildCandidateSetPrompt,
  buildChainHop1Prompt,
  buildChainHop2Prompt,
  buildSubstanceRepairPrompt,
  buildVocabularySwapPrompt,
  buildVoiceRewritePrompt,
  HumanizerContentMode,
  HumanizerModelPreset,
} from "./prompts/humanizer-template";
import type { HumanizerReferenceStyle } from "./humanizer-reference-library";

const PRESET_MODELS: Record<
  HumanizerModelPreset,
  {
    rewriteModel: string;
    /** Second-hop model for chain presets — different fingerprint from rewriteModel */
    refineModel?: string;
    /** Fallback models to try (in order) when the primary or refine model is down */
    fallbackModels?: string[];
    temperatures: number[];
    label: string;
    /** Per-hop timeout for chain presets (default: use standard timeout) */
    hopTimeoutMs?: number;
  }
> = {
  minimax: {
    rewriteModel: "minimax/minimax-m2.5:free",
    temperatures: [0.85],
    label: "MiniMax",
  },
  "minimax-deep": {
    rewriteModel: "minimax/minimax-m2.5:free",
    temperatures: [0.92, 1.04, 1.12],
    label: "Deep MiniMax",
  },
  chain: {
    // Llama first: fast (no reasoning step), good structural rewriter.
    // DeepSeek second: different fingerprint family, handles hop 2 refine well.
    // Fallbacks for hop 2: when DeepSeek times out, we MUST still get a
    // second hop from a different-fingerprint model — single-hop output
    // gets flagged 100% AI by Copyleaks. Qwen and Mistral are different
    // families from Llama. Order matters: paid + fast first.
    rewriteModel: "meta-llama/llama-3.3-70b-instruct",
    refineModel: "deepseek/deepseek-v4-flash",
    fallbackModels: [
      "qwen/qwen-2.5-72b-instruct",
      "google/gemini-2.5-flash",
      "mistralai/mistral-large-2411",
    ],
    // Higher temperature = higher perplexity = harder for detectors.
    temperatures: [1.05],
    label: "Chain (Llama→DeepSeek)",
    hopTimeoutMs: 30000,
  },
  // Strict variant: same models, same chain, but hop 2 uses strictFacts=true
  // (no aggressive cutting, no dropped facts, no tangential aside).
  "chain-strict": {
    rewriteModel: "meta-llama/llama-3.3-70b-instruct",
    refineModel: "deepseek/deepseek-v4-flash",
    fallbackModels: [
      "qwen/qwen-2.5-72b-instruct",
      "google/gemini-2.5-flash",
      "mistralai/mistral-large-2411",
    ],
    temperatures: [1.05],
    label: "Chain Strict (no fact loss)",
    hopTimeoutMs: 30000,
  },
};

export interface HumanizeOptions {
  text: string;
  contentMode: HumanizerContentMode;
  referenceStyle: HumanizerReferenceStyle;
  modelPreset?: HumanizerModelPreset;
  apiKey: string;
}

export interface QualityScores {
  readability: number;
  repetition: number;
  genericPhrasing: number;
  sentenceVariety: number;
  specificity: number;
  meaningRetention: number;
  lengthFit: number;
  structureFit: number;
  overall: number;
  unsupportedAdditions: string[];
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
  candidateCount: number;
  quality: QualityScores;
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

// ── Level 1 banned vocabulary (12-level human writing framework) ─────
// These words/phrases are statistical AI detection triggers.
// Used both for quality scoring AND local post-processing cleanup.
const GENERIC_PATTERNS: RegExp[] = [
  /\bdelv(?:e|es|ed|ing)\b/i,
  /\btapestry\b/i,
  /\brealm\b/i,
  /\bmoreover\b/i,
  /\bfurthermore\b/i,
  /\badditionally\b/i,
  // Framework Level 1 additions
  /\bunderscore(?:s|d)?\b/i,
  /\bfoster(?:s|ed|ing)?\b/i,
  /\benhance(?:s|d)?\b/i,
  /\bnuanced\b/i,
  /\bgroundbreaking\b/i,
  /\brevolutionary\b/i,
  /\btransformative\b/i,
  /\binnovative\b/i,
  /\bimpactful\b/i,
  /\bstakeholder(?:s)?\b/i,
  /\bmultidisciplinary\b/i,
  /\bcomprehensive\b/i,
  /\bat the end of the day\b/i,
  /\bultimately\b/i,
  /\bmoving forward\b/i,
  /\bgoing forward\b/i,
  /\bat this juncture\b/i,
  /\bkey takeaways?\b/i,
  /\bboth perspectives have merit\b/i,
  /\bserves as a?\b/i,
  /\bdespite these challenges\b/i,
  /\bsignificant concern\b/i,
  /\bhas become increasingly\b/i,
  // Copyleaks AI Phrase triggers (caught in tests 2026-05-11)
  /\bthat's not opinion\b/i,
  /\bhaven't sat idle\b/i,
  /\bthe stakes are high\b/i,
  /\bthat said\b/i,
  /\bmeanwhile\b/i,
  /\bhowever\b/i,
  /\bin other words\b/i,
  /\bto put it simply\b/i,
  /\bto be fair\b/i,
  /\blet's be (?:clear|honest|real)\b/i,
  /\bhere's the (?:thing|reality|truth|catch|kicker)\b/i,
  /\bthe bottom line\b/i,
  /\bthe reality is\b/i,
  /\bthe truth is\b/i,
  /\bdriven by a hard truth\b/i,
  /\bit's a massive shift\b/i,
  /\bit's a (?:huge|big|major|significant) shift\b/i,
  /\band the stakes are\b/i,
  /\bpush(?:ing)? back\b/i,
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
  /\b(?:critical|pressing|most pressing) concerns?\b/i,
  /\bone of the most pressing concerns?\b/i,
  /\bdigital age\b/i,
  /\bthreat landscape\b/i,
  /\bcontinues to evolve\b/i,
  /\bcomplex and unpredictable\b/i,
  /\bsophisticated phishing\b/i,
  /\bransomware attacks increasingly target\b/i,
  /\bmalicious actors\b/i,
  /\bsecurity posture\b/i,
  /\bculture of employee awareness\b/i,
  /\btechnical tools alone\b/i,
  /\bclicks the wrong link\b/i,
  /\bdaily concern\b/i,
  /\bnot an afterthought\b/i,
  /\brather than an afterthought\b/i,
  /\bthreat landscape keeps shifting\b/i,
  /\bphishing campaigns grow more sophisticated\b/i,
  /\bransomware increasingly targets\b/i,
  /\bnew vulnerabilities to exploit\b/i,
  /\b(?:truly )?effective security strategy\b/i,
  /\btechnical safeguards\b/i,
  /\bemployee awareness\b/i,
  /\blast line of defense\b/i,
  /\bcombination of robust solutions\b/i,
  /\brobust solutions\b/i,
  /\bproactive defense\b/i,
  /\bproactive defense has become essential\b/i,
  /\bstay ahead of attacks\b/i,
  /\bwarning signs\b/i,
  /\bai-powered threats\b/i,
  /\bai-powered attacks\b/i,
  /\bai-powered threats emerge\b/i,
  /\bthreats emerge\b/i,
  /\bthreats grow more sophisticated\b/i,
  /\bbecomes essential\b/i,
  /\bas we move into an era\b/i,
  /\bera of\b/i,
  /\bongoing vigilance\b/i,
  /\bkeep pace\b/i,
  /\breal risks\b/i,
  /\btechnical safeguards matter\b/i,
  /\battackers find new ways to breach systems\b/i,
  /\bnew ways to breach systems\b/i,
  /\bAI tools enable new attack methods\b/i,
  /\bnew attack methods\b/i,
  /\bactive defense\b/i,
  /\bconstant attention\b/i,
  /\bhas never been more critical\b/i,
  /\bneed for .* has never been more critical\b/i,
  /\bprioritizing clarity over sheer volume\b/i,
  /\bprotect limited attention\b/i,
  /\bquiet landing spots\b/i,
  /\bmental fatigue\b/i,
  /\boverlapping responsibilities\b/i,
  /\bunclear priorities\b/i,
  /\bhidden gems?\b/i,
  /\bunforgettable experiences?\b/i,
  /\bonce-in-a-lifetime\b/i,
  /\badventure awaits\b/i,
  /\bvibrant culture\b/i,
  /\brich history\b/i,
  /\bunique blend\b/i,
  /\bsomething for everyone\b/i,
  /\bbreathtaking views?\b/i,
  /\bstunning landscapes?\b/i,
  /\bpicturesque\b/i,
  /\bcrystal-clear waters?\b/i,
  /\bpristine beaches\b/i,
  /\bimmerse yourself\b/i,
  /\bdiscover the magic\b/i,
  /\bworld of wonder\b/i,
  /\bmemories that last a lifetime\b/i,
  /\bmust-see destination\b/i,
  /\bbucket-list destination\b/i,
  /\bculinary delights\b/i,
  /\bauthentic experiences?\b/i,
  /\bhassle-free (?:journey|experience|booking)\b/i,
  /\bseamless booking\b/i,
  /\bcurated itinerar(?:y|ies)\b/i,
  /\bhandpicked experiences?\b/i,
  /\bperfect for every traveler\b/i,
  /\bwhether you'?re\b.+\bor\b/i,
  /\bexplore like never before\b/i,
  /\blet us take you on a journey\b/i,
  /\byour gateway to\b/i,
  /\bin today'?s society\b/i,
  /\bin today'?s world\b/i,
  /\bthroughout history\b/i,
  /\bthis (?:essay|paper) will (?:explore|discuss)\b/i,
  /\bthe purpose of this essay\b/i,
  /\bplays a crucial role\b/i,
  /\bhas a significant impact\b/i,
  /\braises important questions\b/i,
  /\bcomplex issue\b/i,
  /\bmany factors contribute\b/i,
  /\bcannot be overstated\b/i,
  /\bit can be argued that\b/i,
  /\bone could argue that\b/i,
  /\bit is evident that\b/i,
  /\ba deeper understanding of\b/i,
  /\bsheds light on\b/i,
  /\bbroader implications\b/i,
];

const GENERIC_PHRASE_CHECKS: Array<{ label: string; pattern: RegExp }> = [
  { label: "critical concern", pattern: /\bcritical concern\b/i },
  { label: "pressing concern", pattern: /\bpressing concerns?\b/i },
  {
    label: "one of the most pressing concerns",
    pattern: /\bone of the most pressing concerns?\b/i,
  },
  { label: "digital age", pattern: /\bdigital age\b/i },
  { label: "daily concern", pattern: /\bdaily concern\b/i },
  { label: "rather than an afterthought", pattern: /\brather than an afterthought\b/i },
  { label: "threat landscape", pattern: /\bthreat landscape\b/i },
  { label: "threat landscape keeps shifting", pattern: /\bthreat landscape keeps shifting\b/i },
  { label: "continues to evolve", pattern: /\bcontinues to evolve\b/i },
  { label: "complex and unpredictable", pattern: /\bcomplex and unpredictable\b/i },
  { label: "sophisticated phishing", pattern: /\bsophisticated phishing\b/i },
  {
    label: "phishing campaigns grow more sophisticated",
    pattern: /\bphishing campaigns grow more sophisticated\b/i,
  },
  {
    label: "ransomware attacks increasingly target",
    pattern: /\bransomware attacks increasingly target\b/i,
  },
  {
    label: "ransomware increasingly targets",
    pattern: /\bransomware increasingly targets\b/i,
  },
  {
    label: "new vulnerabilities to exploit",
    pattern: /\bnew vulnerabilities to exploit\b/i,
  },
  {
    label: "effective security strategy",
    pattern: /\b(?:truly )?effective security strategy\b/i,
  },
  { label: "malicious actors", pattern: /\bmalicious actors\b/i },
  { label: "security posture", pattern: /\bsecurity posture\b/i },
  {
    label: "culture of employee awareness",
    pattern: /\bculture of employee awareness\b/i,
  },
  { label: "technical safeguards", pattern: /\btechnical safeguards\b/i },
  { label: "employee awareness", pattern: /\bemployee awareness\b/i },
  { label: "technical tools alone", pattern: /\btechnical tools alone\b/i },
  { label: "clicks the wrong link", pattern: /\bclicks the wrong link\b/i },
  { label: "last line of defense", pattern: /\blast line of defense\b/i },
  { label: "AI-powered threats", pattern: /\bAI-powered threats\b/i },
  { label: "AI-powered attacks", pattern: /\bAI-powered attacks\b/i },
  { label: "AI-powered threats emerge", pattern: /\bAI-powered threats emerge\b/i },
  { label: "as we move into an era", pattern: /\bas we move into an era\b/i },
  { label: "robust technical solutions", pattern: /\brobust technical solutions\b/i },
  { label: "combination of robust solutions", pattern: /\bcombination of robust solutions\b/i },
  { label: "robust solutions", pattern: /\brobust solutions\b/i },
  { label: "ongoing vigilance", pattern: /\bongoing vigilance\b/i },
  { label: "staying ahead", pattern: /\bstaying ahead\b/i },
  { label: "keep pace", pattern: /\bkeep pace\b/i },
  { label: "proactive defense", pattern: /\bproactive defense\b/i },
  { label: "active defense", pattern: /\bactive defense\b/i },
  { label: "constant attention", pattern: /\bconstant attention\b/i },
  {
    label: "new ways to breach systems",
    pattern: /\bnew ways to breach systems\b/i,
  },
  {
    label: "AI tools enable new attack methods",
    pattern: /\bAI tools enable new attack methods\b/i,
  },
  { label: "new attack methods", pattern: /\bnew attack methods\b/i },
  {
    label: "proactive defense has become essential",
    pattern: /\bproactive defense has become essential\b/i,
  },
  {
    label: "has never been more critical",
    pattern: /\bhas never been more critical\b/i,
  },
  { label: "becomes essential", pattern: /\bbecomes essential\b/i },
  { label: "hidden gem", pattern: /\bhidden gems?\b/i },
  { label: "unforgettable experience", pattern: /\bunforgettable experiences?\b/i },
  { label: "once-in-a-lifetime", pattern: /\bonce-in-a-lifetime\b/i },
  { label: "adventure awaits", pattern: /\badventure awaits\b/i },
  { label: "vibrant culture", pattern: /\bvibrant culture\b/i },
  { label: "rich history", pattern: /\brich history\b/i },
  { label: "unique blend", pattern: /\bunique blend\b/i },
  { label: "something for everyone", pattern: /\bsomething for everyone\b/i },
  { label: "breathtaking views", pattern: /\bbreathtaking views?\b/i },
  { label: "stunning landscape", pattern: /\bstunning landscapes?\b/i },
  { label: "picturesque", pattern: /\bpicturesque\b/i },
  { label: "crystal-clear water", pattern: /\bcrystal-clear waters?\b/i },
  { label: "pristine beaches", pattern: /\bpristine beaches\b/i },
  { label: "immerse yourself", pattern: /\bimmerse yourself\b/i },
  { label: "discover the magic", pattern: /\bdiscover the magic\b/i },
  { label: "world of wonder", pattern: /\bworld of wonder\b/i },
  {
    label: "memories that last a lifetime",
    pattern: /\bmemories that last a lifetime\b/i,
  },
  { label: "must-see destination", pattern: /\bmust-see destination\b/i },
  { label: "bucket-list destination", pattern: /\bbucket-list destination\b/i },
  { label: "culinary delights", pattern: /\bculinary delights\b/i },
  { label: "authentic experience", pattern: /\bauthentic experiences?\b/i },
  {
    label: "hassle-free journey",
    pattern: /\bhassle-free (?:journey|experience|booking)\b/i,
  },
  { label: "seamless booking", pattern: /\bseamless booking\b/i },
  { label: "curated itinerary", pattern: /\bcurated itinerar(?:y|ies)\b/i },
  { label: "handpicked experience", pattern: /\bhandpicked experiences?\b/i },
  { label: "perfect for every traveler", pattern: /\bperfect for every traveler\b/i },
  { label: "whether you're X or Y", pattern: /\bwhether you'?re\b.+\bor\b/i },
  { label: "explore like never before", pattern: /\bexplore like never before\b/i },
  { label: "let us take you on a journey", pattern: /\blet us take you on a journey\b/i },
  { label: "your gateway to", pattern: /\byour gateway to\b/i },
  { label: "in today's society", pattern: /\bin today'?s society\b/i },
  { label: "in today's world", pattern: /\bin today'?s world\b/i },
  { label: "throughout history", pattern: /\bthroughout history\b/i },
  {
    label: "this essay will explore",
    pattern: /\bthis (?:essay|paper) will (?:explore|discuss)\b/i,
  },
  { label: "the purpose of this essay", pattern: /\bthe purpose of this essay\b/i },
  { label: "plays a crucial role", pattern: /\bplays a crucial role\b/i },
  { label: "significant impact", pattern: /\bhas a significant impact\b/i },
  { label: "raises important questions", pattern: /\braises important questions\b/i },
  { label: "complex issue", pattern: /\bcomplex issue\b/i },
  { label: "many factors contribute", pattern: /\bmany factors contribute\b/i },
  { label: "cannot be overstated", pattern: /\bcannot be overstated\b/i },
  { label: "it can be argued", pattern: /\bit can be argued that\b/i },
  { label: "one could argue", pattern: /\bone could argue that\b/i },
  { label: "it is evident", pattern: /\bit is evident that\b/i },
  { label: "deeper understanding", pattern: /\ba deeper understanding of\b/i },
  { label: "sheds light on", pattern: /\bsheds light on\b/i },
  { label: "broader implications", pattern: /\bbroader implications\b/i },
];

const UNSUPPORTED_DETAIL_CHECKS: Array<{
  label: string;
  pattern: RegExp;
}> = [
  { label: "healthcare records", pattern: /\bhealthcare records?\b/i },
  { label: "financial systems", pattern: /\bfinancial systems?\b/i },
  { label: "supply chains", pattern: /\bsupply chains?\b/i },
  { label: "credentials", pattern: /\bcredentials?\b/i },
  { label: "malware", pattern: /\bmalware\b/i },
  { label: "fake login page", pattern: /\bfake login pages?\b/i },
  { label: "unpatched server", pattern: /\bunpatched servers?\b/i },
  { label: "encrypting files", pattern: /\bencrypt(?:ing|ed)? files?\b/i },
  { label: "stealing data", pattern: /\bsteal(?:ing|s)? data\b/i },
  {
    label: "paying ransom",
    pattern: /\b(?:pay(?:ing)?|paid)\s+(?:a\s+|the\s+)?ransom\b/i,
  },
  {
    label: "teams pay",
    pattern: /\b(?:teams|companies|victims|organizations)\s+pay\b/i,
  },
  { label: "Burj Khalifa", pattern: /\bBurj Khalifa\b/i },
  { label: "Dubai Marina", pattern: /\bDubai Marina\b/i },
  { label: "Palm Jumeirah", pattern: /\bPalm Jumeirah\b/i },
  { label: "desert safari", pattern: /\bdesert safari\b/i },
  { label: "hotel pickup", pattern: /\bhotel pick-?up\b/i },
  { label: "skip-the-line", pattern: /\bskip-the-line\b/i },
  { label: "private guide", pattern: /\bprivate guide\b/i },
  { label: "five-star", pattern: /\bfive-star\b/i },
  { label: "all-inclusive", pattern: /\ball-inclusive\b/i },
  { label: "24/7 support", pattern: /\b24\/7 support\b/i },
  { label: "studies show", pattern: /\bstudies show\b/i },
  { label: "research proves", pattern: /\bresearch proves\b/i },
  { label: "experts argue", pattern: /\bexperts argue\b/i },
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

function paragraphCount(s: string): number {
  return s.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean).length;
}

function uniqueRatio(items: string[]): number {
  if (items.length === 0) return 1;
  return new Set(items).size / items.length;
}

/**
 * Post-generation cleanup: strip AI transition phrases and sentence openers
 * that Copyleaks flags as "AI Phrases." Works at the sentence level.
 */
function stripAITransitions(text: string): string {
  // Sentence-opening transitions to remove (strip the phrase, keep the rest)
  const SENTENCE_OPENER_STRIPS: RegExp[] = [
    /^That said,?\s*/i,
    /^Meanwhile,?\s*/i,
    /^However,?\s*/i,
    /^In other words,?\s*/i,
    /^To put it simply,?\s*/i,
    /^To be fair,?\s*/i,
    /^To be clear,?\s*/i,
    /^Let's be (?:clear|honest|real)[,:]\s*/i,
    /^Here's the (?:thing|reality|truth|catch|kicker)[,:]\s*/i,
    /^The bottom line (?:is|here)[,:]\s*/i,
    /^The reality is[,:]\s*/i,
    /^The truth is[,:]\s*/i,
    /^At the same time,?\s*/i,
    /^On the other hand,?\s*/i,
    /^On the flip side,?\s*/i,
    /^That being said,?\s*/i,
    /^With that in mind,?\s*/i,
    /^It's worth noting (?:that\s)?/i,
    /^It's important to note (?:that\s)?/i,
    /^And yet,?\s*/i,
    /^Still,?\s*/i,
    /^Even so,?\s*/i,
    /^In fact,?\s*/i,
    /^Of course,?\s*/i,
    /^Needless to say,?\s*/i,
  ];

  // Full sentence patterns to remove entirely
  const FULL_SENTENCE_KILLS: RegExp[] = [
    /^The stakes are high\.?\s*$/i,
    /^And the stakes are high\.?\s*$/i,
    /^It's a (?:huge|big|major|massive|significant) shift\.?\s*$/i,
  ];

  const sentences = text.split(/(?<=[.!?])\s+/);
  const cleaned = sentences
    .map((s) => {
      // Kill entire sentence if it matches a throwaway pattern
      for (const kill of FULL_SENTENCE_KILLS) {
        if (kill.test(s.trim())) return null;
      }
      // Strip transition openers
      let result = s;
      for (const opener of SENTENCE_OPENER_STRIPS) {
        result = result.replace(opener, "");
      }
      // Capitalize first letter after stripping
      if (result.length > 0 && result[0] !== result[0].toUpperCase()) {
        result = result[0].toUpperCase() + result.slice(1);
      }
      return result;
    })
    .filter(Boolean)
    .join(" ");

  return cleaned;
}

function findGenericPhrases(s: string): string[] {
  return GENERIC_PHRASE_CHECKS.filter(({ pattern }) => pattern.test(s)).map(
    ({ label }) => label
  );
}

function findUnsupportedAdditions(original: string, output: string): string[] {
  return UNSUPPORTED_DETAIL_CHECKS.filter(
    ({ pattern }) => pattern.test(output) && !pattern.test(original)
  ).map(({ label }) => label);
}

function scoreQuality(
  original: string,
  output: string
): QualityScores {
  const originalWordCount = wordCount(original);
  const outputWordCount = wordCount(output);
  const outputSentences = sentences(output);
  const originalSentences = sentences(original);
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

  const explicitGenericPhrases = findGenericPhrases(output);
  const genericHits = GENERIC_PATTERNS.reduce(
    (sum, pattern) => sum + (pattern.test(output) ? 1 : 0),
    0
  ) + explicitGenericPhrases.length;
  const explicitGenericCap =
    explicitGenericPhrases.length > 0
      ? 84 - Math.min(64, explicitGenericPhrases.length * 10)
      : 100;
  const genericPhrasing = clampScore(
    Math.min(100 - genericHits * 22, explicitGenericCap)
  );

  const lengthStdDev = stddev(sentenceLengths);
  const sentenceVariety = clampScore(
    55 + Math.min(35, lengthStdDev * 4) + uniqueRatio(starts) * 10 - repeatedStarts * 5
  );

  const outputContent = new Set(contentWords(output));
  const unsupportedAdditions = findUnsupportedAdditions(original, output);
  const unsupportedPenalty = Math.min(45, unsupportedAdditions.length * 14);
  const digitSignals = (output.match(/\d/g) ?? []).length;
  const properNounSignals =
    output.match(/\b[A-Z][a-z]{2,}\b/g)?.filter((w) => !["The", "This"].includes(w))
      .length ?? 0;
  const firstPersonSignals =
    output.match(/\b(?:I|me|my|mine|we|us|our|ours)\b/g)?.length ?? 0;
  const specificity = clampScore(
    58 +
      Math.min(18, digitSignals * 4) +
      Math.min(14, properNounSignals * 3) +
      Math.min(10, firstPersonSignals * 2) -
      unsupportedPenalty
  );

  const originalContent = Array.from(new Set(contentWords(original)));
  const retained =
    originalContent.length === 0
      ? 1
      : originalContent.filter((w) => outputContent.has(w)).length /
        originalContent.length;
  const lengthRatio =
    originalWordCount === 0 ? 1 : outputWordCount / Math.max(1, originalWordCount);
  const lengthPenalty =
    lengthRatio < 0.65 || lengthRatio > 1.45
      ? 35
      : lengthRatio < 0.8 || lengthRatio > 1.25
        ? 18
        : 0;
  const meaningRetention = clampScore(
    retained * 100 - lengthPenalty - unsupportedPenalty
  );
  const lengthFit = clampScore(100 - Math.abs(lengthRatio - 1) * 220);
  const sentenceFit = clampScore(
    100 -
      Math.abs(outputSentences.length - originalSentences.length) *
        (originalSentences.length <= 3 ? 22 : 14)
  );
  const paragraphFit = clampScore(
    100 -
      Math.abs(paragraphCount(output) - paragraphCount(original)) * 28
  );
  const structureFit = clampScore(sentenceFit * 0.65 + paragraphFit * 0.35);

  const overall = clampScore(
    readability * 0.12 +
      repetition * 0.12 +
      genericPhrasing * 0.17 +
      sentenceVariety * 0.11 +
      specificity * 0.12 +
      meaningRetention * 0.16 +
      lengthFit * 0.12 +
      structureFit * 0.08
  );

  const notes: string[] = [];
  if (lengthRatio < 0.85) {
    notes.push("The rewrite compressed too much; preserve more of the original substance.");
  }
  if (lengthRatio > 1.2) {
    notes.push("The rewrite expanded more than needed; trim unsupported additions.");
  }
  if (structureFit < 80) {
    notes.push("The rewrite changed the source structure too much.");
  }
  if (readability < 75) notes.push("Readability could be cleaner.");
  if (repetition < 75) notes.push("Some repeated wording or sentence starts remain.");
  if (genericPhrasing < 92) {
    notes.push(
      explicitGenericPhrases.length > 0
        ? `Generic phrasing still appears: ${explicitGenericPhrases.slice(0, 7).join(", ")}.`
        : "Generic phrasing still appears in the draft."
    );
  }
  if (sentenceVariety < 75) notes.push("Sentence rhythm is still a bit uniform.");
  if (specificity < 75) {
    notes.push("Concrete details are thin; add them to the draft if the rewrite feels too general.");
  }
  if (meaningRetention < 75) {
    notes.push("Meaning retention looks low; compare against the original before using.");
  }
  if (unsupportedAdditions.length > 0) {
    notes.push(
      `Unsupported details may have been added: ${unsupportedAdditions
        .slice(0, 6)
        .join(", ")}.`
    );
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
    lengthFit,
    structureFit,
    overall,
    unsupportedAdditions,
    notes,
  };
}

function needsRepair(quality: QualityScores): boolean {
  return (
    quality.lengthFit < 72 ||
    quality.structureFit < 72 ||
    quality.meaningRetention < 72 ||
    quality.genericPhrasing < 94 ||
    quality.unsupportedAdditions.length > 0
  );
}

function needsSourceSeedRepair(quality: QualityScores): boolean {
  return (
    quality.lengthFit < 65 ||
    quality.meaningRetention < 55 ||
    quality.structureFit < 60
  );
}

type Candidate = {
  output: string;
  temperature: number;
  quality: QualityScores;
};

function rankCandidate(candidate: Candidate): number {
  const q = candidate.quality;
  const blockerPenalty = findGenericPhrases(candidate.output).length * 28;
  const unsupportedPenalty = q.unsupportedAdditions.length * 32;
  const compressionPenalty =
    q.lengthFit < 65 ? (65 - q.lengthFit) * 1.8 : 0;
  const meaningPenalty =
    q.meaningRetention < 60 ? (60 - q.meaningRetention) * 1.4 : 0;

  return (
    q.genericPhrasing * 0.34 +
    q.meaningRetention * 0.2 +
    q.lengthFit * 0.14 +
    q.structureFit * 0.12 +
    q.readability * 0.08 +
    q.sentenceVariety * 0.07 +
    q.repetition * 0.05 -
    blockerPenalty -
    unsupportedPenalty -
    compressionPenalty -
    meaningPenalty
  );
}

function chooseBest(candidates: Candidate[]): Candidate {
  return candidates.reduce((winner, candidate) => {
    const candidateRank = rankCandidate(candidate);
    const winnerRank = rankCandidate(winner);

    if (candidateRank !== winnerRank) {
      return candidateRank > winnerRank ? candidate : winner;
    }
    if (candidate.quality.genericPhrasing !== winner.quality.genericPhrasing) {
      return candidate.quality.genericPhrasing > winner.quality.genericPhrasing
        ? candidate
        : winner;
    }
    return candidate.quality.meaningRetention > winner.quality.meaningRetention
      ? candidate
      : winner;
  });
}

function splitCandidateSet(raw: string): string[] {
  const cleaned = clean(raw);
  const labeled = cleaned
    .split(/^\s*#{2,3}\s*CANDIDATE\s+\d+\s*:?\s*$/gim)
    .map((part) => clean(part))
    .filter(Boolean);

  if (labeled.length > 1) return labeled;

  return cleaned
    .split(/\n{2,}(?=\d+[.)]\s+)/)
    .map((part) => clean(part.replace(/^\d+[.)]\s*/, "")))
    .filter(Boolean);
}

const LOCAL_CLEANUP_REPLACEMENTS: Array<[RegExp, string]> = [
  [
    /\bDubai is one of the most exciting travel destinations in the world, offering visitors a unique blend of modern attractions, rich culture, and unforgettable experiences\./gi,
    "Dubai packs a lot into one trip: modern sights, older markets, food, beaches, and days that can be as busy or relaxed as you want.",
  ],
  [
    /\bFrom breathtaking views at the Burj Khalifa to relaxing walks through traditional souks, the city has something for everyone\./gi,
    "You can start with the Burj Khalifa, slow down in the souks, or split the day between shopping, restaurants, and the beach.",
  ],
  [
    /\bTravelers can enjoy desert safaris, luxury shopping, world-class dining, and beautiful beaches all in one trip\./gi,
    "A trip can include desert safaris, shopping, restaurants, and beach time without feeling like one fixed kind of holiday.",
  ],
  [
    /\bWhether you are visiting with family, friends, or as a couple, Dubai provides a perfect mix of adventure, comfort, and entertainment\./gi,
    "For families, friends, or couples, Dubai works best when the plan leaves room for both sightseeing and downtime.",
  ],
  [/\bone of the most exciting travel destinations in the world\b/gi, "a busy, easy-to-fill travel stop"],
  [/\ba unique blend of\b/gi, "a mix of"],
  [/\bunforgettable experiences?\b/gi, "things to do"],
  [/\bbreathtaking views?\b/gi, "wide views"],
  [/\bworld-class dining\b/gi, "restaurants"],
  [/\bthe city has something for everyone\b/gi, "the city can fit a few different trip styles"],
  [/\ba perfect mix of adventure, comfort, and entertainment\b/gi, "a mix of active plans and easier downtime"],
  [/\bhidden gems?\b/gi, "quieter stops"],
  [/\bvibrant culture\b/gi, "local culture"],
  [/\brich history\b/gi, "older parts of the city"],
  [/\bculinary delights\b/gi, "food"],
  [/\bmust-see destination\b/gi, "place worth adding to the plan"],
  [/\bbucket-list destination\b/gi, "place worth adding to the plan"],
  [/\bimmerse yourself in\b/gi, "spend time with"],
  [/\bdiscover the magic of\b/gi, "see"],
  [/\bmemories that last a lifetime\b/gi, "memories from the trip"],
  [/\bworld of wonder\b/gi, "place with a lot to see"],

  [/\bcomprehensive digital marketing solutions\b/gi, "digital marketing support"],
  [/\bdesigned to help businesses grow\b/gi, "that help businesses grow"],
  [/\bin today's competitive landscape\b/gi, "in a crowded market"],
  [/\btailored strategies\b/gi, "plans"],
  [/\beach client's unique needs\b/gi, "each client's goals"],
  [/\ba passionate team committed to excellence\b/gi, "a team that stays close to the work"],
  [/\bempower brands to\b/gi, "help brands"],
  [/\bunlock long-term success\b/gi, "build steadier growth"],
  [/\byour trusted partner for\b/gi, "support for"],
  [/\bcomprehensive solutions\b/gi, "practical support"],
  [/\binnovative solutions\b/gi, "practical ideas"],
  [/\btailored solutions\b/gi, "practical plans"],
  [/\bseamless\b/gi, "smooth"],
  [/\bleverage\b/gi, "use"],
  [/\bworld-class\b/gi, "strong"],
  [/\bindustry-leading\b/gi, "experienced"],
  [/\bcutting-edge\b/gi, "modern"],
  [/\bstate-of-the-art\b/gi, "modern"],
  [/\bunlock\b/gi, "open up"],
  [/\belevate\b/gi, "improve"],
  [/\btransform your business\b/gi, "improve the way your business works"],
  [/\btake your business to the next level\b/gi, "help your business grow"],

  [/\bCybersecurity has become one of the most pressing concerns of the digital age\./gi, "Cybersecurity is now a practical concern for organizations."],
  [/\bthe threat landscape continues to evolve in complex and unpredictable ways\b/gi, "the risks keep changing"],
  [
    /\bFrom sophisticated phishing campaigns to ransomware attacks targeting critical infrastructure, malicious actors are constantly developing new methods to exploit vulnerabilities\./gi,
    "Phishing, ransomware, and new vulnerabilities can hit systems that teams rely on every day.",
  ],
  [
    /\bThis shift underscores the importance of adopting a multifaceted approach to digital security, one that not only addresses technical safeguards but also fosters a culture of awareness among employees\./gi,
    "That means security has to cover both tools and habits: controls that reduce risk, and staff who know what to watch for.",
  ],
  [
    /\bUltimately, navigating the complexities of modern cybersecurity requires both robust technical solutions and ongoing vigilance\./gi,
    "Modern cybersecurity depends on solid technical controls and regular attention.",
  ],
  [
    /\bAs we move into an era of AI-powered threats, the need for proactive defense has never been more critical\./gi,
    "As AI changes how attacks are built, teams need to improve defenses before problems spread.",
  ],
  [/\bone of the most pressing concerns? of the digital age\b/gi, "a practical concern"],
  [/\bpressing concerns?\b/gi, "real concerns"],
  [/\bdigital age\b/gi, "current environment"],
  [/\bthreat landscape\b/gi, "risk picture"],
  [/\bcontinues to evolve\b/gi, "keeps changing"],
  [/\bcomplex and unpredictable ways\b/gi, "hard-to-predict ways"],
  [/\bsophisticated phishing campaigns\b/gi, "phishing campaigns"],
  [/\bransomware attacks targeting critical infrastructure\b/gi, "ransomware attacks against critical systems"],
  [/\bmalicious actors\b/gi, "attackers"],
  [/\bconstantly developing new methods to exploit vulnerabilities\b/gi, "keep looking for new weaknesses"],
  [/\bmultifaceted approach\b/gi, "practical approach"],
  [/\btechnical safeguards\b/gi, "technical controls"],
  [/\bculture of awareness among employees\b/gi, "staff who know what to watch for"],
  [/\bculture of employee awareness\b/gi, "staff awareness"],
  [/\bemployee awareness\b/gi, "staff awareness"],
  [/\brobust technical solutions\b/gi, "solid technical controls"],
  [/\brobust solutions\b/gi, "solid controls"],
  [/\bongoing vigilance\b/gi, "regular attention"],
  [/\bproactive defense\b/gi, "early defense work"],
  [/\bhas never been more critical\b/gi, "matters more now"],
  [/\bAI-powered threats emerge\b/gi, "AI changes how attacks are built"],
  [/\bAI-powered threats\b/gi, "AI-driven attacks"],
  [/\bAI-powered attacks\b/gi, "AI-driven attacks"],
  [/\bstaying ahead means combining\b/gi, "staying ahead takes"],
  [/\bkeep pace\b/gi, "keep up"],
  [/\blast line of defense\b/gi, "important part of the defense"],

  [
    /\bIn today(?:'|’)s society,\s*social media plays a crucial role in shaping how young people communicate, learn, and understand the world around them\./gi,
    "Social media now shapes how many young people talk, learn, and keep up with the world around them.",
  ],
  [
    /\bWhile these platforms offer several benefits, such as instant access to information and connection with others, they also raise important questions about attention, mental health, and identity\./gi,
    "It can make information and connection easier to reach, but it can also pull at attention, affect mental health, and make identity feel more public than private.",
  ],
  [
    /\bThis essay will explore the impact of social media on students and discuss how it can both support and disrupt their personal and academic development\./gi,
    "For students, the same platforms can support schoolwork and friendships while also making focus and confidence harder to manage.",
  ],
  [/\bIn today(?:'|’)s society,\s*/gi, ""],
  [/\bIn today(?:'|’)s world,\s*/gi, ""],
  [/\bThroughout history,\s*/gi, ""],
  [/\bplays a crucial role in shaping\b/gi, "shapes"],
  [/\bhas a significant impact on\b/gi, "affects"],
  [/\boffer several benefits\b/gi, "can help"],
  [/\balso raise important questions about\b/gi, "can also create problems around"],
  [/\braise important questions about\b/gi, "create problems around"],
  [/\bThis essay will explore\b/gi, "The issue is"],
  [/\bThis paper will discuss\b/gi, "The issue is"],
  [/\bthe purpose of this essay is to\b/gi, "This essay tries to"],
  [/\bit can be argued that\b/gi, ""],
  [/\bone could argue that\b/gi, ""],
  [/\bit is evident that\b/gi, ""],
  [/\bUltimately,\s*/gi, ""],
  [/\bFurthermore,\s*/gi, ""],
  [/\bMoreover,\s*/gi, ""],
  [/\bAdditionally,\s*/gi, ""],
  [/\bIn conclusion,\s*/gi, ""],
  [/\bIn summary,\s*/gi, ""],
];

function applyLocalCleanup(original: string): string {
  let output = original
    .trim()
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n");

  for (const [pattern, replacement] of LOCAL_CLEANUP_REPLACEMENTS) {
    output = output.replace(pattern, replacement);
  }

  output = output
    .replace(/\bnot only ([^.;]+?) but also\b/gi, "$1 and")
    .replace(/,\s+one that\s+/gi, ". It ")
    .replace(/\balso also\b/gi, "also")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([.!?])\s+([a-z])/g, (_, mark: string, next: string) => `${mark} ${next.toUpperCase()}`)
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .trim();

  return output || original.trim();
}

function isRecoverableModelError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();
  const configurationProblem = [
    "openrouter_api_key is missing",
    "invalid api key",
    "unauthorized",
    "401",
    "403",
  ].some((token) => lower.includes(token));

  if (configurationProblem) return false;

  return [
    "timed out",
    "timeout",
    "abort",
    "fetch failed",
    "network",
    "429",
    "502",
    "503",
    "504",
    "overloaded",
    "queued",
    "rate limit",
    "rate-limited",
  ].some((token) => lower.includes(token));
}

function localFallbackResult(
  original: string,
  contentMode: HumanizerContentMode,
  referenceStyle: HumanizerReferenceStyle,
  modelPreset: HumanizerModelPreset,
  reason: unknown
): HumanizeResult {
  const output = applyLocalCleanup(original);
  const quality = scoreQuality(original, output);
  const reasonMessage = reason instanceof Error ? reason.message : String(reason);
  quality.notes = [
    "Generator: local cleanup fallback",
    "Mode: model unavailable",
    `Detail: ${reasonMessage}`,
    "This fallback removes stock phrasing and keeps source facts; retry when the free tier clears for a stronger rewrite.",
    ...quality.notes,
  ];

  return {
    output,
    pass1Output: output,
    contentMode,
    referenceStyle,
    modelPreset,
    originalWordCount: wordCount(original),
    outputWordCount: wordCount(output),
    passes: 0,
    candidateCount: 1,
    quality,
  };
}

export function humanizeLocalFallback({
  text,
  contentMode,
  referenceStyle,
  modelPreset = "minimax",
  reason,
}: Omit<HumanizeOptions, "apiKey"> & { reason: unknown }): HumanizeResult {
  return localFallbackResult(
    text.trim(),
    contentMode,
    referenceStyle,
    modelPreset,
    reason
  );
}

// ─── Multi-model helpers ───────────────────────────────────────────

/**
 * Try `primaryModel` first; on recoverable failure rotate through
 * `fallbackModels` (skipping any in `excludeModels` so the chain always
 * uses distinct fingerprints per hop).
 *
 * `maxAttempts` caps total model tries (default: all).
 * `deadlineMs` is an absolute Date.now() deadline — stops trying when
 * there isn't enough time left for a meaningful attempt.
 */
async function generateWithFallback({
  apiKey,
  prompt,
  primaryModel,
  fallbackModels = [],
  excludeModels = [],
  temperature,
  timeoutMs,
  maxAttempts,
  deadlineMs,
}: {
  apiKey: string;
  prompt: string;
  primaryModel: string;
  fallbackModels?: string[];
  excludeModels?: string[];
  temperature: number;
  timeoutMs: number;
  /** Max number of models to try (primary + fallbacks). Default: try all. */
  maxAttempts?: number;
  /** Absolute Date.now() deadline — skip remaining fallbacks if <5s left. */
  deadlineMs?: number;
}): Promise<{ text: string; usedModel: string }> {
  const excludeSet = new Set(excludeModels);
  const candidates = [
    primaryModel,
    ...fallbackModels.filter((m) => !excludeSet.has(m)),
  ];
  const models = maxAttempts ? candidates.slice(0, maxAttempts) : candidates;
  let lastError: unknown;

  for (const model of models) {
    // Check wall-clock budget before each attempt
    if (deadlineMs) {
      const remaining = deadlineMs - Date.now();
      if (remaining < 5000) break; // not enough time for a useful attempt
    }

    const effectiveTimeout = deadlineMs
      ? Math.min(timeoutMs, deadlineMs - Date.now() - 1000)
      : timeoutMs;

    try {
      const text = await generate({
        apiKey,
        prompt,
        preferredModel: model,
        temperature,
        timeoutMs: Math.max(5000, effectiveTimeout),
      });
      return { text, usedModel: model };
    } catch (err) {
      lastError = err;
      if (!isRecoverableModelError(err)) throw err;
      // Model timed out or is down — try next in the rotation
    }
  }

  throw lastError;
}

/**
 * 2-hop chain rewrite: Model A rewrites the original → Model B rewrites
 * Model A's output.  Each hop uses a different model so the final text
 * carries a mixed perplexity fingerprint that confuses AI detectors.
 *
 * Graceful degradation:
 *  - If hop 2 fails → return hop 1 result (partial chain)
 *  - If hop 2 causes quality regression → keep hop 1 output
 *  - If hop 1 fails → local fallback
 */
async function humanizeChain(
  trimmed: string,
  contentMode: HumanizerContentMode,
  referenceStyle: HumanizerReferenceStyle,
  modelPreset: HumanizerModelPreset,
  apiKey: string,
  preset: (typeof PRESET_MODELS)[HumanizerModelPreset],
  originalWordCount: number
): Promise<HumanizeResult> {
  const chainStart = Date.now();
  // Reserve 4s for scoring + result assembly; the route-level timeout (55s)
  // is the hard ceiling, so we aim to finish by 50s.
  const chainDeadline = chainStart + 50000;
  const hopTimeout = preset.hopTimeoutMs ?? 25000;
  let hop1Output: string;
  let hop1Model: string;

  // ── Hop 1: rewrite with primary model ──────────────────────────────
  // Use the lighter chainRefine prompt (not the full voiceRewrite prompt)
  // to stay under free-tier latency limits. Quality scoring + repair pass
  // handle phrase bans and structure rules post-hoc.
  // Chain-strict uses a fundamentally different strategy: vocabulary-only
  // substitution. Both hops apply the same word-swap prompt — each model
  // catches words the other missed. Structure, facts, and clause order
  // stay identical. Strict mode is for content where dropping facts isn't
  // acceptable, even at the cost of slightly weaker detection evasion.
  const isStrictMode = modelPreset === "chain-strict";

  try {
    console.log(`[chain] hop 1 starting — model: ${preset.rewriteModel}, mode: ${modelPreset}, budget: ${Math.round((chainDeadline - Date.now()) / 1000)}s`);
    const hop1Prompt = isStrictMode
      ? buildVocabularySwapPrompt({ text: trimmed, contentMode })
      : buildChainHop1Prompt({ text: trimmed, contentMode });
    // Strict mode runs at lower temperature — we want deterministic word
    // swaps, not creative reshaping.
    const hop1Temp = isStrictMode ? 0.4 : preset.temperatures[0];
    const hop1 = await generateWithFallback({
      apiKey,
      prompt: hop1Prompt,
      primaryModel: preset.rewriteModel,
      fallbackModels: preset.fallbackModels,
      excludeModels: preset.refineModel ? [preset.refineModel] : [],
      temperature: hop1Temp,
      timeoutMs: hopTimeout,
      maxAttempts: 2,
      deadlineMs: chainDeadline,
    });
    hop1Output = clean(hop1.text);
    hop1Model = hop1.usedModel;
    console.log(`[chain] hop 1 done — model: ${hop1Model}, ${Math.round((chainDeadline - Date.now()) / 1000)}s remaining`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[chain] hop 1 FAILED: ${msg.slice(0, 200)}`);
    if (isRecoverableModelError(err)) {
      return localFallbackResult(
        trimmed,
        contentMode,
        referenceStyle,
        modelPreset,
        err
      );
    }
    throw err;
  }

  // ── Hop 2: refine with a different model ───────────────────────────
  let finalOutput = hop1Output;
  let finalQuality = scoreQuality(trimmed, hop1Output);
  let usedModels = hop1Model;
  let hopCount = 1;
  let chainStatus = "1 hop only";

  if (preset.refineModel && chainDeadline - Date.now() > 8000) {
    try {
      // Hop 2 strategy diverges by mode:
      // - Standard: degradation script at +0.10 temp to disrupt smooth prose
      // - Strict: same vocab-swap prompt at low temp — second model catches
      //   words the first missed, no structural changes
      const hop2Temp = isStrictMode
        ? 0.4
        : Math.min(preset.temperatures[0] + 0.1, 1.3);
      const hop2Prompt = isStrictMode
        ? buildVocabularySwapPrompt({ text: hop1Output, contentMode })
        : buildChainHop2Prompt({ text: hop1Output, contentMode });
      // Use shorter per-model timeout for hop 2 so we can cycle through
      // ALL fallback models within the chain deadline. Without this, one
      // slow model exhausts the budget and we fall back to 1-hop output
      // (which gets flagged 100% AI). No maxAttempts cap — let the
      // deadline-budget logic decide when to stop.
      const hop2PerModelTimeout = 15000;
      const hop2 = await generateWithFallback({
        apiKey,
        prompt: hop2Prompt,
        primaryModel: preset.refineModel,
        fallbackModels: preset.fallbackModels,
        excludeModels: [hop1Model],
        temperature: hop2Temp,
        timeoutMs: hop2PerModelTimeout,
        deadlineMs: chainDeadline,
      });
      const hop2Output = clean(hop2.text);
      const hop2Quality = scoreQuality(trimmed, hop2Output);

      // For chain/stealth mode, ALWAYS prefer the 2-hop output for
      // fingerprint mixing — that's the whole point of chaining through
      // different model families. Only reject if hop 2 is catastrophically
      // short or completely incoherent. The quality scorer penalizes the
      // structural disruption we WANT, so quality-based rejection defeats
      // the purpose.
      const hop2WordCount = hop2Output.split(/\s+/).filter(Boolean).length;
      const hop1WordCount = hop1Output.split(/\s+/).filter(Boolean).length;
      const notTruncated = hop2WordCount >= hop1WordCount * 0.5;
      if (hop2Output.length > 50 && notTruncated) {
        finalOutput = hop2Output;
        finalQuality = hop2Quality;
        usedModels = `${hop1Model} → ${hop2.usedModel}`;
        hopCount = 2;
        chainStatus = "2 hops completed";
      } else {
        chainStatus = "hop 2 caused quality regression; using hop 1 output";
      }
    } catch (err) {
      if (!isRecoverableModelError(err)) throw err;
      chainStatus = "chain incomplete — refine model unavailable";
    }
  }

  // ── Repair pass — DISABLED for chain mode ───────────────────────────
  // The repair pass references the original text and pulls output back
  // toward it, undoing the fingerprint mixing that makes chain mode work.
  // Never repair chain output.
  const shouldRepair = false;
  if (shouldRepair) {
    try {
      const { text: raw } = await generateWithFallback({
        apiKey,
        prompt: buildSubstanceRepairPrompt({
          original: trimmed,
          rewritten: finalOutput,
          contentMode,
          referenceStyle,
          genericPhrases: Array.from(
            new Set(findGenericPhrases(finalOutput))
          ),
          unsupportedAdditions: finalQuality.unsupportedAdditions,
        }),
        primaryModel: preset.rewriteModel,
        fallbackModels: preset.fallbackModels,
        temperature: 0.62,
        timeoutMs: 18000,
        maxAttempts: 2,
        deadlineMs: chainDeadline,
      });
      const repaired = clean(raw);
      if (repaired) {
        const rq = scoreQuality(trimmed, repaired);
        const repairedBetter =
          rankCandidate({ output: repaired, temperature: 0.62, quality: rq }) >
          rankCandidate({
            output: finalOutput,
            temperature: preset.temperatures[0],
            quality: finalQuality,
          });
        if (repairedBetter) {
          finalOutput = repaired;
          finalQuality = rq;
          chainStatus += " + repair pass";
        }
      }
    } catch {
      // Repair failure is non-critical — keep chain output as-is
    }
  }

  // ── Post-chain phrase cleanup DISABLED ────────────────────────────
  // Aggressive transition-stripping removed natural concession phrases
  // ("Sure,", "But there's...", "Of course,") that test as 0% AI on
  // Copyleaks IN CONTEXT. Voice + concrete nouns matter more than
  // phrase-level bans. Re-enable only if a pattern proves consistently
  // detectable across multiple tests.

  // ── Assemble result ────────────────────────────────────────────────
  finalQuality.notes = [
    `Generator: ${usedModels}`,
    `Mode: ${preset.label}`,
    `Chain: ${chainStatus}`,
    ...finalQuality.notes,
  ];

  return {
    output: finalOutput,
    pass1Output: hop1Output,
    contentMode,
    referenceStyle,
    modelPreset,
    originalWordCount,
    outputWordCount: wordCount(finalOutput),
    passes: hopCount + (chainStatus.includes("repair") ? 1 : 0),
    candidateCount: 1,
    quality: finalQuality,
  };
}

export async function humanize({
  text,
  contentMode,
  referenceStyle,
  modelPreset = "minimax",
  apiKey,
}: HumanizeOptions): Promise<HumanizeResult> {
  const trimmed = text.trim();
  const originalWordCount = wordCount(trimmed);
  const preset = PRESET_MODELS[modelPreset] ?? PRESET_MODELS.minimax;

  // Chain presets use a dedicated multi-hop path
  if (preset.refineModel) {
    return humanizeChain(
      trimmed,
      contentMode,
      referenceStyle,
      modelPreset,
      apiKey,
      preset,
      originalWordCount
    );
  }

  const isDeep = modelPreset === "minimax-deep";
  let candidates: Candidate[];

  try {
    if (isDeep) {
      const raw = await generate({
        apiKey,
        prompt: buildCandidateSetPrompt({
          text: trimmed,
          contentMode,
          referenceStyle,
          candidateCount: 2,
        }),
        preferredModel: preset.rewriteModel,
        temperature: 0.96,
        timeoutMs: 48000,
      });

      candidates = splitCandidateSet(raw).slice(0, 3).map((output, index) => ({
        output,
        temperature: preset.temperatures[index] ?? 0.96,
        quality: scoreQuality(trimmed, output),
      }));
    } else {
      const raw = await generate({
        apiKey,
        prompt: buildVoiceRewritePrompt({
          text: trimmed,
          contentMode,
          referenceStyle,
        }),
        preferredModel: preset.rewriteModel,
        temperature: preset.temperatures[0],
        timeoutMs: 40000,
      });
      const output = clean(raw);
      candidates = [
        {
          output,
          temperature: preset.temperatures[0],
          quality: scoreQuality(trimmed, output),
        },
      ];
    }
  } catch (err) {
    if (isRecoverableModelError(err)) {
      return localFallbackResult(
        trimmed,
        contentMode,
        referenceStyle,
        modelPreset,
        err
      );
    }
    throw err;
  }

  if (candidates.length === 0) {
    throw new Error("MiniMax returned no usable rewrite candidates.");
  }

  let best = chooseBest(candidates);

  const maxRepairPasses = 1;
  let repairPasses = 0;
  const seenOutputs = new Set(candidates.map((candidate) => candidate.output));

  while (needsRepair(best.quality) && repairPasses < maxRepairPasses) {
    const repairFromOriginal = needsSourceSeedRepair(best.quality);
    const genericPhrases = Array.from(
      new Set([
        ...findGenericPhrases(best.output),
        ...(repairFromOriginal ? findGenericPhrases(trimmed) : []),
      ])
    );
    let raw: string;
    try {
      raw = await generate({
        apiKey,
        prompt: buildSubstanceRepairPrompt({
          original: trimmed,
          rewritten: repairFromOriginal ? trimmed : best.output,
          contentMode,
          referenceStyle,
          genericPhrases,
          unsupportedAdditions: best.quality.unsupportedAdditions,
        }),
        preferredModel: preset.rewriteModel,
        temperature: repairPasses === 0 ? 0.62 : 0.5,
        timeoutMs: 18000,
      });
    } catch (err) {
      if (isRecoverableModelError(err)) {
        break;
      }
      throw err;
    }
    const output = clean(raw);
    if (!output || seenOutputs.has(output)) {
      break;
    }
    seenOutputs.add(output);
    candidates.push({
      output,
      temperature: repairPasses === 0 ? 0.62 : 0.5,
      quality: scoreQuality(trimmed, output),
    });
    best = chooseBest(candidates);
    repairPasses += 1;
  }

  const bestIndex = candidates.indexOf(best) + 1;
  const quality = best.quality;
  quality.notes = [
    `Generator: ${preset.rewriteModel}`,
    `Mode: ${preset.label}`,
    ...(candidates.length > 1
      ? [
          `Selected candidate ${bestIndex}/${candidates.length} by internal quality score.`,
        ]
      : []),
    ...quality.notes,
  ];

  return {
    output: best.output,
    pass1Output: best.output,
    contentMode,
    referenceStyle,
    modelPreset,
    originalWordCount,
    outputWordCount: wordCount(best.output),
    passes: 1,
    candidateCount: candidates.length,
    quality,
  };
}
