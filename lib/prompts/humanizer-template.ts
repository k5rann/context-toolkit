import {
  buildReferenceStyleGuidance,
  type HumanizerReferenceStyle,
} from "@/lib/humanizer-reference-library";

export type HumanizerContentMode =
  | "auto"
  | "email"
  | "paragraph"
  | "phrase"
  | "academic"
  | "casual"
  | "business";

export type HumanizerModelPreset =
  | "minimax"
  | "minimax-deep"
  | "chain"
  | "chain-strict";

export const CONTENT_MODES: Array<{
  id: HumanizerContentMode;
  label: string;
  short: string;
  description: string;
}> = [
  {
    id: "auto",
    label: "Auto",
    short: "Detects the draft shape",
    description:
      "Keeps the one-box workflow simple by adapting to website copy, travel guides, essays, emails, or paragraphs.",
  },
  {
    id: "email",
    label: "Email",
    short: "Clear, sendable message",
    description:
      "Turns a rough draft into an email that feels direct, polite, and easy to send.",
  },
  {
    id: "paragraph",
    label: "Paragraph",
    short: "One polished block",
    description:
      "Best for rewriting a single paragraph while keeping the original point intact.",
  },
  {
    id: "phrase",
    label: "Phrase",
    short: "Short, natural wording",
    description:
      "Tightens a sentence, caption, heading, reply, or awkward phrase.",
  },
  {
    id: "academic",
    label: "Academic",
    short: "Careful, formal argument",
    description:
      "Keeps claims precise and structured without sounding stiff or inflated.",
  },
  {
    id: "casual",
    label: "Casual",
    short: "Warm, conversational",
    description:
      "Sounds like a real person explaining something plainly, with natural contractions.",
  },
  {
    id: "business",
    label: "Business",
    short: "Concise professional copy",
    description:
      "Sharper wording for updates, proposals, LinkedIn posts, and client-facing notes.",
  },
];

export const MODEL_PRESETS: Array<{
  id: HumanizerModelPreset;
  label: string;
  short: string;
  description: string;
}> = [
  {
    id: "minimax",
    label: "MiniMax-m2.5",
    short: "OpenRouter MiniMax",
    description:
      "Routes through OpenRouter to MiniMax m2.5 for one-pass website copy rewriting.",
  },
  {
    id: "minimax-deep",
    label: "Deep MiniMax",
    short: "3 candidates, internally ranked",
    description:
      "Generates several MiniMax drafts and keeps the strongest one by internal writing-quality checks.",
  },
  {
    id: "chain",
    label: "Stealth Chain",
    short: "2-model fingerprint mix",
    description:
      "Rewrites through two different models in sequence to mix AI fingerprints and reduce detection scores.",
  },
  {
    id: "chain-strict",
    label: "Stealth Strict",
    short: "Chain, all facts preserved",
    description:
      "Same 2-model chain but preserves every fact and avoids the tangential aside. Slightly higher detection score, zero information loss.",
  },
];

const MODE_GUIDANCE: Record<HumanizerContentMode, string> = {
  auto:
    "Detect the draft's purpose first. If it is website/company/travel copy, make it concrete and scan-friendly. If it is an essay or student paragraph, preserve the author's level, argument, and source meaning without adding claims. If it is an email or note, keep it direct and sendable. Do not mention the detected category.",
  email:
    "Write as an email body. Keep it sendable: clear ask, natural opening if needed, tidy close only if the draft already implies one. Do not add a subject line unless the input has one.",
  paragraph:
    "Write as one strong paragraph unless the input clearly needs more than one. Preserve the point, remove stiffness, and keep transitions quiet. Avoid thesis-first essay phrasing.",
  phrase:
    "Write compactly. If the input is a phrase or single sentence, return one improved version only. Do not expand it into an essay.",
  academic:
    "Write in a careful academic register. Keep claims qualified, preserve citations and named concepts, and avoid inflated language.",
  casual:
    "Write conversationally. Contractions are welcome. Keep it relaxed, specific, and unforced.",
  business:
    "Write in concise website/business prose. Keep the concrete offer, service, audience, or result already present in the text. Remove filler and keep the voice confident without sounding corporate. Do not invent a company claim such as \"we help\" unless the draft already speaks as the company.",
};

const DEFAULT_VOICE = `Use a natural, specific, low-drama voice:
- concrete nouns over vague abstractions
- active verbs where they fit
- contractions when the mode allows them
- varied sentence length without making the rhythm theatrical
- plain transitions instead of formal filler`;

const GENERIC_PHRASE_BANS = `GENERIC PHRASES TO AVOID:
- delve, tapestry, realm, journey as a metaphor
- moreover, furthermore, additionally as default transitions
- in conclusion, in summary, to summarize
- it is important to note, it is worth noting
- navigate the complexities, navigate the nuances
- robust, seamless, holistic, multifaceted as filler adjectives
- leverage as a verb when "use" is enough
- testament to, pivotal, paramount, ushering in
- cutting-edge, state-of-the-art, world-class, best-in-class, industry-leading as unsupported filler
- unlock, elevate, empower, transform your business, take your business to the next level
- tailored solutions, bespoke solutions, comprehensive solutions, innovative solutions
- designed to meet your unique needs, in today's competitive landscape
- committed to excellence, passionate about excellence, your trusted partner
- not just X, but Y
- X offers several key benefits
- first/second/third enumeration inside flowing prose unless the user asked for a list
- the primary challenge, the real challenge, the goal is to create
- critical concern, pressing concern, most pressing concern, one of the most pressing concerns
- digital age
- threat landscape, continues to evolve, complex and unpredictable
- sophisticated phishing, ransomware attacks increasingly target
- malicious actors, security posture, culture of employee awareness
- technical tools alone, clicks the wrong link
- daily concern, not an afterthought
- rather than an afterthought, threat landscape keeps shifting
- phishing campaigns grow more sophisticated, ransomware increasingly targets, new vulnerabilities to exploit
- truly effective security strategy, effective security strategy
- technical safeguards, employee awareness, last line of defense
- combination of robust solutions, robust solutions
- proactive defense, proactive defense has become essential, stay ahead of attacks, warning signs, keep pace
- AI-powered threats, AI-powered attacks, AI-powered threats emerge, threats emerge, threats grow more sophisticated, becomes essential
- attackers find new ways to breach systems, new ways to breach systems, AI tools enable new attack methods, new attack methods
- active defense, constant attention, has never been more critical
- as we move into an era, era of, ongoing vigilance
- real risks as a vague bridge phrase
- technical safeguards matter as a standalone sentence
- as a student, for many students, I hear a lot about, productivity is often talked about
- the main challenge, the main issue, the real issue
- that's why I need, that's why any productivity system needs
- constant notifications, little interruptions, too much on my plate when used as stock phrasing
- complicated layer of planning, becomes a task itself
- figure out the few things that matter most, the few things that matter most
- make progress feel manageable, makes progress feel doable
- prioritizing clarity over sheer volume, protect limited attention, quiet landing spots
- mental fatigue, overlapping responsibilities, unclear priorities as stock explanatory phrases`;

const TRAVEL_PHRASE_BANS = `TRAVEL AND HOSPITALITY PHRASES TO AVOID:
- hidden gem, unforgettable experience, once-in-a-lifetime, adventure awaits
- vibrant culture, rich history, unique blend, something for everyone
- breathtaking views, stunning landscapes, picturesque, crystal-clear waters, pristine beaches
- immerse yourself, discover the magic, world of wonder, memories that last a lifetime
- must-see destination, bucket-list destination, captivating, enchanting, charming escape
- culinary delights, local culture as filler, authentic experience without specifics
- hassle-free journey, seamless booking, curated itinerary, handpicked experiences
- perfect for every traveler, whether you're X or Y, from X to Y as a stock opener
- explore like never before, let us take you on a journey, your gateway to`;

const ESSAY_PHRASE_BANS = `ESSAY PHRASES TO AVOID:
- in today's society, in today's world, throughout history as a generic opener
- this essay will explore, this paper will discuss, the purpose of this essay
- plays a crucial role, has a significant impact, raises important questions
- complex issue, many factors contribute, cannot be overstated
- it can be argued that, one could argue that, it is evident that
- ultimately as a default closer
- a deeper understanding of, sheds light on, broader implications`;

const PLAIN_SPOKEN_RULES = `PLAIN-SPOKEN EDITING RULES:
- Prefer the user's smaller words when they are clearer.
- Do not open with a polished thesis sentence if a concrete situation can lead.
- Avoid making every sentence balanced and complete. One sentence can be blunt.
- Keep one or two ordinary details instead of replacing them with abstractions.
- Do not write a general article about the topic when the draft points to one concrete situation.
- Avoid paragraph machinery where each paragraph starts by announcing what the paragraph is doing.
- For website copy, do not make unsupported claims. If a sentence could fit any company, make it plainer or cut it.
- If the rewrite starts sounding like an advice article, pull it back toward the concrete details already in the draft.`;

const SECURITY_COPY_RULES = `SECURITY COPY RULES:
- If the text is about cybersecurity, avoid polished industry summary language.
- Do not use "digital age", "most pressing concern", "threat landscape", "proactive defense", "active defense", "last line of defense", "effective security strategy", "technical safeguards", or "employee awareness".
- Say the concrete thing instead: where the data sits, what kind of attack hits it, who has to notice it, and what the team must do.
- Do not add examples the source did not name, such as healthcare records, financial systems, supply chains, unpatched servers, fake login pages, credentials, malware, ransom payments, or stolen data.
- If the source only says "technical safeguards", keep that concept plain as security tools, controls, or safeguards. Do not invent a list of specific controls unless the source names them.`;

const AUTO_SHAPE_RULES = `AUTO-SHAPE RULES:
- Website/company copy: keep the service, audience, location, and offer easy to scan. Cut hype. Do not invent proof, guarantees, awards, or outcomes.
- Travel copy: keep named places, timings, inclusions, exclusions, transport details, and sensory details already present. Replace tourism cliches with specific logistics or plain descriptions.
- Essay/student copy: improve clarity and flow, but keep the writer's level and argument. Do not add citations, personal experiences, statistics, or examples that are not in the draft.
- Academic copy: preserve terms, qualifiers, and source claims. Avoid grand thesis openings and inflated conclusions.
- First-person drafts: keep first person unless the draft clearly asks for a different voice.
- If the text is generic because the source is generic, produce a clearer modest version rather than pretending it has more evidence.`;

const QUALITY_RULES = `QUALITY RULES:
1. Preserve the user's meaning, factual claims, numbers, names, and constraints.
2. Remove generic phrasing and filler, but do not make the prose weird for its own sake.
3. Improve readability: shorter clauses, clearer subjects, less throat-clearing.
4. Improve voice specificity: make it sound like one person wrote it for one purpose.
5. Vary sentence openings and sentence length naturally.
6. Use concrete details already present in the draft; if there are not many, stay modest rather than pretending to be personal.
7. Keep the output close to the original length unless the selected mode obviously requires compression. Do not summarize multi-sentence drafts into a short blurb.
8. Do not add new examples, industries, incidents, outcomes, tools, or mechanisms that the original does not mention.
9. Output only the rewritten text. No preface, no labels, no commentary, no quote marks.`;

function countWords(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

function countSentences(s: string): number {
  return s.split(/(?<=[.!?])\s+/).map((part) => part.trim()).filter(Boolean)
    .length;
}

function countParagraphs(s: string): number {
  return s.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean).length;
}

function compactRuleLines(block: string, draft: string, fallbackCount: number): string[] {
  const lowerDraft = draft.toLowerCase();
  const lines = block
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "));
  const matched = lines.filter((line) => {
    const keywords = line
      .slice(2)
      .toLowerCase()
      .split(/[,;()/-]|\bor\b|\band\b/)
      .map((part) => part.replace(/["']/g, "").trim())
      .filter((part) => part.length >= 6);
    return keywords.some((keyword) => lowerDraft.includes(keyword));
  });

  return (matched.length > 0 ? matched : lines.slice(0, fallbackCount)).slice(
    0,
    fallbackCount
  );
}

function compactAvoidanceRules(text: string, contentMode: HumanizerContentMode): string {
  const modeSpecific =
    contentMode === "academic"
      ? compactRuleLines(ESSAY_PHRASE_BANS, text, 8)
      : contentMode === "business"
        ? compactRuleLines(GENERIC_PHRASE_BANS, text, 10)
        : [];
  const travel = compactRuleLines(TRAVEL_PHRASE_BANS, text, 6);
  const essay = compactRuleLines(ESSAY_PHRASE_BANS, text, 7);
  const generic = compactRuleLines(GENERIC_PHRASE_BANS, text, 10);

  return Array.from(new Set([...modeSpecific, ...travel, ...essay, ...generic]))
    .slice(0, 18)
    .join("\n");
}

function compactStyleGuidance(referenceStyle: HumanizerReferenceStyle): string {
  const profile = buildReferenceStyleGuidance(referenceStyle);
  return profile
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 14)
    .join("\n");
}

function compactEditorialRules(text: string): string {
  const lower = text.toLowerCase();
  const pieces = [
    DEFAULT_VOICE.split("\n").slice(1, 4).join("\n"),
    PLAIN_SPOKEN_RULES.split("\n").slice(1, 5).join("\n"),
    AUTO_SHAPE_RULES.split("\n").slice(1, 4).join("\n"),
    QUALITY_RULES.split("\n").slice(1, 5).join("\n"),
  ];

  if (
    lower.includes("cyber") ||
    lower.includes("phishing") ||
    lower.includes("ransomware") ||
    lower.includes("security")
  ) {
    pieces.push(SECURITY_COPY_RULES.split("\n").slice(1, 5).join("\n"));
  }

  return pieces.join("\n");
}

export function buildVoiceRewritePrompt({
  text,
  contentMode,
  referenceStyle,
}: {
  text: string;
  contentMode: HumanizerContentMode;
  referenceStyle: HumanizerReferenceStyle;
}): string {
  const originalWordCount = countWords(text);
  const originalSentenceCount = countSentences(text);
  const originalParagraphCount = countParagraphs(text);
  const minWords =
    contentMode === "phrase"
      ? Math.max(1, Math.floor(originalWordCount * 0.5))
      : Math.max(1, Math.floor(originalWordCount * 0.85));
  const maxWords =
    contentMode === "phrase"
      ? Math.max(minWords, Math.ceil(originalWordCount * 1.5))
      : Math.max(minWords, Math.ceil(originalWordCount * 1.15));
  const avoidRules = compactAvoidanceRules(text, contentMode);

  return `Rewrite this draft as a close human edit. Keep the same facts and useful substance.

CONTENT MODE:
${MODE_GUIDANCE[contentMode]}

TARGET:
- ${minWords}-${maxWords} words, ${originalParagraphCount} paragraph(s), about ${originalSentenceCount} sentence(s).
- Preserve names, numbers, claims, examples, risks, tools, services, audiences, and constraints.
- Do not add examples, proof, guarantees, personal experiences, citations, or company claims.
- Keep it plain, specific, and readable. Use contractions only when they fit.
- Avoid thesis-first openings, polished summaries, and topic-overview language.
- Output only the rewritten text.

STYLE:
${compactStyleGuidance(referenceStyle)}

EDITING RULES:
${compactEditorialRules(text)}

AVOID THESE STOCK PHRASES OR CLOSE VARIANTS:
${avoidRules || "- generic openings, inflated adjectives, and sales/essay boilerplate"}

DRAFT TO REWRITE:
---
${text}
---

REWRITTEN TEXT:`;
}

export function buildSubstanceRepairPrompt({
  original,
  rewritten,
  contentMode,
  referenceStyle,
  genericPhrases = [],
  unsupportedAdditions = [],
}: {
  original: string;
  rewritten: string;
  contentMode: HumanizerContentMode;
  referenceStyle: HumanizerReferenceStyle;
  genericPhrases?: string[];
  unsupportedAdditions?: string[];
}): string {
  const originalWordCount = countWords(original);
  const rewrittenWordCount = countWords(rewritten);
  const originalSentenceCount = countSentences(original);
  const originalParagraphCount = countParagraphs(original);
  const minWords =
    contentMode === "phrase"
      ? Math.max(1, Math.floor(originalWordCount * 0.5))
      : Math.max(1, Math.floor(originalWordCount * 0.9));
  const maxWords =
    contentMode === "phrase"
      ? Math.max(minWords, Math.ceil(originalWordCount * 1.5))
      : Math.max(minWords, Math.ceil(originalWordCount * 1.12));
  const avoidRules = compactAvoidanceRules(`${original}\n${rewritten}`, contentMode);

  return `Repair this rewrite. It became too short, generic, or too different from the source.

CONTENT MODE:
${MODE_GUIDANCE[contentMode]}

TARGET:
- Original: ${originalWordCount} words, ${originalParagraphCount} paragraph(s), ${originalSentenceCount} sentence(s).
- Current rewrite: ${rewrittenWordCount} words.
- Final output: ${minWords}-${maxWords} words. A shorter output is invalid.
- Restore missing facts, examples, named concepts, risks, tools, audiences, and constraints from the original.
- Keep the language plain. Do not add "we help", sales claims, guarantees, outcomes, proof, examples, or citations unless present in the original.
${genericPhrases.length > 0 ? `- The current rewrite contains these stock phrases. Remove or replace every one: ${genericPhrases.join(", ")}.` : ""}
${unsupportedAdditions.length > 0 ? `- The current rewrite appears to add details that are not in the original. Remove them unless the original explicitly contains them: ${unsupportedAdditions.join(", ")}.` : ""}
- Avoid these stock phrases or close variants:
${avoidRules || "- generic openings, inflated adjectives, and sales/essay boilerplate"}

STYLE:
${compactStyleGuidance(referenceStyle)}

EDITING RULES:
${compactEditorialRules(original)}

ORIGINAL DRAFT:
---
${original}
---

CURRENT REWRITE TO REPAIR:
---
${rewritten}
---

Return the repaired final text only.`;
}

export function buildCandidateSetPrompt({
  text,
  contentMode,
  referenceStyle,
  candidateCount,
}: {
  text: string;
  contentMode: HumanizerContentMode;
  referenceStyle: HumanizerReferenceStyle;
  candidateCount: number;
}): string {
  const labels = Array.from(
    { length: candidateCount },
    (_, index) => `### CANDIDATE ${index + 1}`
  ).join("\n");

  return `${buildVoiceRewritePrompt({ text, contentMode, referenceStyle })}

For this request, return ${candidateCount} distinct candidate rewrites instead of one.

FORMAT RULES:
- Use exactly these labels:
${labels}
- Put only rewritten text under each label.
- Do not add explanations, scores, or notes.
- Each candidate must obey the same length, structure, meaning, and phrasing rules above.
- Do not include any candidate that is shorter than the target word range.
- Make each candidate naturally different in wording and rhythm, while preserving the same facts.

OUTPUT:`;
}

/**
 * Vocabulary-only substitution prompt. Used by BOTH hops in chain-strict mode.
 *
 * Strategy: hold the factual line and structure of every sentence; only swap
 * out the complex/Latinate/marketing-inflated words for simpler everyday
 * equivalents. Each hop catches words the previous model missed.
 *
 * This is the opposite of the chain-standard hop 2 degradation script. There
 * we strategically degrade structure + cut content. Here we touch only
 * surface vocabulary. Better fact preservation, sometimes weaker detection
 * evasion — but cleaner trade for users who can't afford to lose facts.
 */
export function buildVocabularySwapPrompt({
  text,
  contentMode,
}: {
  text: string;
  contentMode: HumanizerContentMode;
}): string {
  const wc = countWords(text);
  // Output stays within ±5% of input length — this is a vocab swap, not a rewrite.
  const minWords = Math.max(1, Math.floor(wc * 0.95));
  const maxWords = Math.max(minWords + 1, Math.ceil(wc * 1.05));

  return `Rewrite the TEXT below by ONLY swapping out complex/Latinate/marketing-inflated words for simpler everyday equivalents. KEEP EVERYTHING ELSE IDENTICAL.

ABSOLUTE RULES:
- Keep every fact, name, number, price, place, date, and proper noun EXACTLY as written.
- Keep every sentence structure and clause order.
- Output ${minWords}-${maxWords} words (within ±5% of input length).
- Do NOT cut, add, reorder, or merge sentences.

APPLY THESE WORD SWAPS (where they appear):

Latinate verbs:
  utilize → use         facilitate → help        demonstrate → show
  ensure → make sure    leverage → use           commence → start
  navigate → go across  embark on → start        comprise → include
  discover → find       transcend → go beyond    encompass → include
  ascend → go up        possess → have

Inflated adjectives:
  comprehensive → full       extensive → wide          remarkable → great
  exceptional → great        unparalleled → top        paramount → main
  meticulously → carefully   profound → deep           pivotal → key
  transformative → big

Marketing clichés (swap or remove if floral):
  seamless → smooth          captivating → fun         mesmerizing → amazing
  immersive → engaging       vibrant → lively          bustling → busy
  pristine → clean           magnificent → great       charming → nice
  exquisite → fine           breathtaking → stunning   stunning → great
  unforgettable → memorable  unrivaled → top           opulent → fancy
  lavish → fancy             enchanting → lovely

Stiff connectors:
  furthermore → also     moreover → also       additionally → and / plus
  hence → so             thus → so             therefore → so

Stuffy verbs:
  witness → see          marvel at → look at   indulge in → enjoy
  partake in → take part in

DO NOT:
- Cut any sentence
- Add any new sentence or aside
- Reorder facts or clauses
- Change any name, number, price, date, or proper noun
- Paraphrase whole clauses — touch only the words listed above (or close equivalents)
- Add em-dashes, asides, or transitions that aren't in the source

If a sentence has no swappable words from the lists above, leave it ALONE.

${MODE_GUIDANCE[contentMode]}

TEXT:
${text}

REWRITTEN (same structure, simpler vocabulary only, ${minWords}-${maxWords} words):`;
}

/**
 * Hop 1 prompt: structural rewrite based on the 12-level human writing framework.
 * Targets the top AI detection signals: uniform sentence length, banned vocabulary,
 * predictable structure, second-paragraph retreat, flat pacing, and absence of
 * inhabited voice (fragments, self-interruption, genuine uncertainty).
 */
export function buildChainHop1Prompt({
  text,
  contentMode,
}: {
  text: string;
  contentMode: HumanizerContentMode;
}): string {
  const wc = countWords(text);
  const minWords = Math.max(1, Math.floor(wc * 0.93));
  const maxWords = Math.max(minWords, Math.ceil(wc * 1.08));

  // Keep the generative prompt SHORT and natural. Over-instructing produces
  // mechanical output (the framework's own Level 10 over-correction warning).
  // The banned phrase list is enforced in post-processing, not here.
  // VALIDATED: this prompt produces 0% AI on Copyleaks when paired with
  // a 2-hop chain (Llama -> DeepSeek). Don't add directives without retest.
  return `Rewrite this ${wc}-word text as a fresh draft. Not a paraphrase. ${minWords}-${maxWords} words. Keep every fact and name.

Lead with the most interesting point, not the original's opening. Use contractions. Mix long sentences with short ones. Don't open with "X has transformed..." — start in the middle. End when the point lands, no wrap-up.

${MODE_GUIDANCE[contentMode]}

TEXT:
${text}

REWRITTEN:`;
}

/**
 * Hop 2 prompt: different model overwrites hop 1's perplexity fingerprint.
 * Maintains structural disruption while adding pacing variation and voice.
 * Based on Levels 2, 6, 10, 11 of the human writing framework.
 */
export function buildChainHop2Prompt({
  text,
  contentMode,
  strictFacts = false,
}: {
  text: string;
  contentMode: HumanizerContentMode;
  /** When true: keep every fact, no tangential aside, smaller cuts. */
  strictFacts?: boolean;
}): string {
  const wc = countWords(text);
  const minWords = Math.max(1, Math.floor(wc * 0.90));
  const maxWords = Math.max(minWords, Math.ceil(wc * 1.10));

  // Hop 2 is a DEGRADATION script, not a polish pass. Validated against
  // humanizeai.pro 2026-05-11 — their output passes Copyleaks 0% AI on
  // content where ours still fails. Their trick: simulate a non-native
  // English copywriter at a small tour agency. The text gets WORSE
  // (clunkier, less fluent, lossy) but reads as human because real human
  // marketing copy is rarely polished.
  //
  // KEY MOVES from the commercial humanizer:
  //   - cut 30-45% of content
  //   - "namely", "etc.", "i.e." used in prose
  //   - clunky passives kept ("drinks served to them")
  //   - tense/POV slips between paragraphs (you → travelers → guests)
  //   - tangential add-on sentence ("It must be noted...")
  //   - 1 fact dropped intentionally
  //
  // BUT: Copyleaks requires 350+ characters (~70+ words) to even score.
  // So for shorter inputs we cut less. The floor is 80 words minimum.
  const COPYLEAKS_MIN_WORDS = 80;

  // Strict facts mode preserves more content (no aggressive cutting, no
  // dropped facts, no tangential aside). Trade-off: slightly higher chance
  // of failing detection, zero information loss.
  const naturalMin = strictFacts
    ? Math.floor(wc * 0.85)
    : Math.floor(wc * 0.6);
  const naturalMax = strictFacts
    ? Math.ceil(wc * 1.05)
    : Math.ceil(wc * 0.85);
  const targetMin = Math.max(naturalMin, COPYLEAKS_MIN_WORDS);
  const targetMax = Math.max(naturalMax, COPYLEAKS_MIN_WORDS + 20);

  const move1 = strictFacts
    ? `MOVE 1 — Keep EVERY fact, name, number, price, duration, and named attraction. Light trimming of pure decoration only. Output should be 85-105% of the source length.`
    : `MOVE 1 — CUT AGGRESSIVELY. Drop entire sentences if they're decorative. Drop adjective chains. Drop 1 minor fact entirely. Output should be 60-85% of the source length.`;

  const move4 = strictFacts
    ? `MOVE 4 — Do NOT add a tangential aside or "It must be noted" sentence. Strict facts mode means: every factual claim must come from the source. But MOVES 2, 3, 5, 6, 7 still apply at full strength — rephrase aggressively, just don't drop or add facts.`
    : `MOVE 4 — Add 1 tangential sentence near the end as an aside. Something a writer would tack on as an afterthought, drawn from a real detail in the source text — NOT a generic logistics note. Pick a specific minor detail from the source and make it the aside.
  Style examples (DON'T copy these verbatim — make up your own from the actual source):
  - "It must be noted that X is also included."
  - "Note: Y is optional but recommended."
  - "Worth mentioning — Z is available on request."`;

  // Examples use abstract placeholders so the model doesn't verbatim-copy
  // content from the examples into outputs (a real bug observed 2026-05-11
  // when Dubai/Bedouin example phrases leaked into a Thailand itinerary).
  return `Rewrite the TEXT below as a non-native English copywriter would: real, slightly clunky, lossy human writing. NOT polished marketing prose. ${targetMin}-${targetMax} words. Keep proper nouns, prices, durations, and place names from the source.${strictFacts ? "\n\n>> STRICT FACTS MODE: do not drop or alter any factual content from the source. Reshape the prose only — but still apply MOVES 2, 3, 5, 6, 7 aggressively." : ""}

DO NOT copy any phrasing from the examples below — they are abstract patterns, not content to use. Generate fresh phrasing from the actual source.

Follow ALL of these moves — they're the difference between polished AI output and real mediocre human writing:

${move1}

MOVE 2 — Use these connectors that AI never uses in prose: "namely", "etc.", "i.e.", "for example,", "in addition,". Sprinkle 1-2 of them naturally where lists or details appear in the source.
  Abstract pattern: "[list of things from source], etc."
  Abstract pattern: "[main thing], namely [details from source]."

MOVE 3 — Keep some clunky/awkward phrasings instead of smoothing them. Passive voice is fine. ESL-sounding constructions are fine.
  Abstract pattern: prefer "[thing] is provided to guests" over "guests enjoy [thing]"
  Abstract pattern: prefer "you will be going to [place]" over "you visit [place]"
  Aggressively smooth-out phrases like "making each moment unforgettable", "experience the magic", "every aspect of your journey" — replace with plain factual statements or cut them.

${move4}

MOVE 5 — Tense/POV slip is FINE. Mix "you", "travelers", "guests", "our visitors" across paragraphs. Don't unify them.

MOVE 6 — Pick simpler/weaker verb where you can. Replace formal/Latinate verbs:
  - "commences" / "begins" → "starts off"
  - "navigate" → "drive across" / "go through"
  - "engage in" → "do" / "take part in"
  - "experience" → "see" / "have" / cut entirely
  - "embark on" → "go on" / "do"
  - "discover" → "see" / "find"
  But don't replace EVERY verb — leave some intact.

MOVE 7 — Don't end with marketing wrap-up. Stop on a small detail or a plain factual statement, not a summary or CTA. Cut phrases like "every moment is designed to be unforgettable", "an experience you will cherish forever".

DO NOT:
- Use em-dashes for stylistic effect (commercial humanizers don't)
- Use contractions everywhere (some yes, some no — humans aren't consistent)
- Write punchy single-word sentences (that's a copywriting move, not a human-writing move)
- Improve clarity or flow — we WANT it slightly clunky
- Copy any specific nouns or details from the example patterns above — use ONLY content from the source TEXT

${MODE_GUIDANCE[contentMode]}

TEXT:
${text}

REWRITTEN (apply all moves; use ONLY content from the source TEXT above; output ${targetMin}-${targetMax} words):`;
}
