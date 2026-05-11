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

export type HumanizerModelPreset = "minimax" | "minimax-deep" | "chain";

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
}: {
  text: string;
  contentMode: HumanizerContentMode;
}): string {
  const wc = countWords(text);
  const minWords = Math.max(1, Math.floor(wc * 0.90));
  const maxWords = Math.max(minWords, Math.ceil(wc * 1.10));

  return `Rephrase this in your own voice. ${minWords}-${maxWords} words. Keep every fact. Keep the argument order.

Use contractions. Vary sentence length — some long, some short. End when the point lands. No wrap-up, no "in conclusion."

${MODE_GUIDANCE[contentMode]}

TEXT:
${text}

REWRITTEN:`;
}
