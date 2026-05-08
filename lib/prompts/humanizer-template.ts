import {
  buildReferenceStyleGuidance,
  type HumanizerReferenceStyle,
} from "@/lib/humanizer-reference-library";

export type HumanizerContentMode =
  | "email"
  | "paragraph"
  | "phrase"
  | "academic"
  | "casual"
  | "business";

export type HumanizerModelPreset =
  | "fast"
  | "balanced"
  | "quality"
  | "experimental-llama"
  | "experimental-qwen"
  | "experimental-minimax"
  | "adversarial";

export const CONTENT_MODES: Array<{
  id: HumanizerContentMode;
  label: string;
  short: string;
  description: string;
}> = [
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
    id: "fast",
    label: "Fast",
    short: "1 pass",
    description:
      "Quick rewrite for everyday cleanup. Best when speed matters more than polish.",
  },
  {
    id: "balanced",
    label: "Balanced",
    short: "2 passes",
    description:
      "Default. Rewrites first, then checks voice, clarity, repetition, and meaning.",
  },
  {
    id: "quality",
    label: "Quality",
    short: "2 passes + stronger model",
    description:
      "Prefers Gemini Pro for harder rewrites and gives the polish pass more room.",
  },
  {
    id: "experimental-llama",
    label: "Llama-3.3-70B",
    short: "Experimental — different fingerprint",
    description:
      "Routes through OpenRouter to Meta Llama 3.3 70B (free). Different model fingerprint than Gemini.",
  },
  {
    id: "experimental-qwen",
    label: "Qwen3-next-80B",
    short: "Experimental — different fingerprint",
    description:
      "Routes through OpenRouter to Alibaba Qwen3-next 80B (free). Chinese model, completely different fingerprint than Gemini.",
  },
  {
    id: "experimental-minimax",
    label: "MiniMax-m2.5",
    short: "Experimental — different fingerprint",
    description:
      "Routes through OpenRouter to MiniMax m2.5 (free). Chinese model with a distinct distribution — strongest non-Western alternative for detector evasion.",
  },
  {
    id: "adversarial",
    label: "Adversarial",
    short: "5 candidates, scored, lowest wins",
    description:
      "NeurIPS-2025-style detector-guided paraphrasing. Generates 5 Gemini candidates at varied temperatures, scores each against a HuggingFace AI-detector model, returns the lowest-AI-score winner. Highest detector-evasion mode but slower (~25s). Surrogate detector ≠ Copyleaks, results may not transfer perfectly.",
  },
];

const MODE_GUIDANCE: Record<HumanizerContentMode, string> = {
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
    "Write in concise website/business prose. Lead with the concrete offer, service, audience, or result already present in the text. Remove filler and keep the voice confident without sounding corporate.",
};

const DEFAULT_VOICE = `If no writing sample is provided, use a natural, specific, low-drama voice:
- concrete nouns over vague abstractions
- active verbs where they fit
- contractions when the mode allows them
- varied sentence length without making the rhythm theatrical
- plain transitions instead of formal filler`;

const STYLE_SAMPLE_RULES = `VOICE MATCHING:
- Treat the writing sample as style evidence, not source material.
- Mirror its sentence length, directness, punctuation habits, warmth, and level of formality.
- Do not copy unique phrases, private details, claims, or examples from the sample.
- If the sample conflicts with the selected mode, keep the selected mode's purpose but borrow the sample's rhythm.`;

const SOURCE_NOTES_RULES = `SOURCE NOTES:
- Treat the source notes as the user's real material.
- Use relevant concrete details from the notes when they strengthen the rewrite.
- Do not invent facts, names, numbers, anecdotes, or examples beyond the draft and notes.
- If the draft is generic and the notes contain specifics, anchor the rewrite in the specifics.
- If the source notes are first-person, keep the rewrite first-person unless the content mode clearly requires distance.
- Do not translate simple notes into polished essay language. Keep the useful roughness.
- If the notes are shorter and more specific than the draft, it is better to produce a shorter grounded rewrite than to pad with generic explanation.`;

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
- as a student, for many students, I hear a lot about, productivity is often talked about
- the main challenge, the main issue, the real issue
- that's why I need, that's why any productivity system needs
- constant notifications, little interruptions, too much on my plate when used as stock phrasing
- complicated layer of planning, becomes a task itself
- figure out the few things that matter most, the few things that matter most
- make progress feel manageable, makes progress feel doable
- prioritizing clarity over sheer volume, protect limited attention, quiet landing spots
- mental fatigue, overlapping responsibilities, unclear priorities as stock explanatory phrases`;

const PLAIN_SPOKEN_RULES = `PLAIN-SPOKEN EDITING RULES:
- Prefer the user's smaller words when they are clearer.
- Do not open with a polished thesis sentence if a concrete situation can lead.
- Avoid making every sentence balanced and complete. One sentence can be blunt.
- Keep one or two ordinary details instead of replacing them with abstractions.
- Do not write a general article about the topic when the source notes point to one person's situation.
- Avoid paragraph machinery where each paragraph starts by announcing what the paragraph is doing.
- For website copy, do not make unsupported claims. If a sentence could fit any company, make it plainer or cut it.
- If the rewrite starts sounding like an advice article, pull it back toward notes from a real person.`;

const QUALITY_RULES = `QUALITY RULES:
1. Preserve the user's meaning, factual claims, numbers, names, and constraints.
2. Remove generic phrasing and filler, but do not make the prose weird for its own sake.
3. Improve readability: shorter clauses, clearer subjects, less throat-clearing.
4. Improve voice specificity: make it sound like one person wrote it for one purpose.
5. Vary sentence openings and sentence length naturally.
6. Use source notes where relevant; a rewrite with no concrete source material should stay modest rather than pretend to be personal.
7. Keep the output close to the original length unless the selected mode obviously requires compression.
8. Output only the rewritten text. No preface, no labels, no commentary, no quote marks.`;

export function buildVoiceRewritePrompt({
  text,
  contentMode,
  referenceStyle,
  writingSample,
  sourceNotes,
}: {
  text: string;
  contentMode: HumanizerContentMode;
  referenceStyle: HumanizerReferenceStyle;
  writingSample?: string;
  sourceNotes?: string;
}): string {
  const sample = writingSample?.trim();
  const notes = sourceNotes?.trim();

  return `You are a writing editor. Rewrite the draft so it sounds natural, purpose-aware, and voice-specific.

CONTENT MODE:
${MODE_GUIDANCE[contentMode]}

${buildReferenceStyleGuidance(referenceStyle)}

${sample ? STYLE_SAMPLE_RULES : DEFAULT_VOICE}

${GENERIC_PHRASE_BANS}

${PLAIN_SPOKEN_RULES}

${QUALITY_RULES}

${sample ? `WRITING SAMPLE FOR STYLE ONLY:\n---\n${sample}\n---\n` : ""}
${notes ? `${SOURCE_NOTES_RULES}\n\nSOURCE NOTES TO USE WHEN RELEVANT:\n---\n${notes}\n---\n` : ""}
DRAFT TO REWRITE:
---
${text}
---

REWRITTEN TEXT:`;
}

export function buildQualityPolishPrompt({
  original,
  rewritten,
  contentMode,
  referenceStyle,
  writingSample,
  sourceNotes,
  originalWordCount,
}: {
  original: string;
  rewritten: string;
  contentMode: HumanizerContentMode;
  referenceStyle: HumanizerReferenceStyle;
  writingSample?: string;
  sourceNotes?: string;
  originalWordCount: number;
}): string {
  const sample = writingSample?.trim();
  const notes = sourceNotes?.trim();
  const minWords = Math.max(1, Math.floor(originalWordCount * 0.85));
  const maxWords = Math.ceil(originalWordCount * 1.15);

  return `You are doing a final editorial pass. Keep what works. Revise only what still feels generic, unclear, repetitive, off-voice, or meaning-drifting.

CONTENT MODE:
${MODE_GUIDANCE[contentMode]}

${buildReferenceStyleGuidance(referenceStyle)}

CHECKLIST:
- readability: can a busy reader understand it on the first pass?
- repetition: remove repeated sentence shapes, repeated starts, and repeated ideas
- generic phrasing: replace vague stock wording with specific, plain wording
- sentence variety: vary rhythm without adding theatrical punctuation
- meaning fidelity: compare against the original and restore any missing facts, names, numbers, or constraints
- specificity: if source notes exist, keep the useful real details instead of sanding them away
- length: aim for ${minWords}-${maxWords} words unless the selected mode requires a shorter output

${sample ? STYLE_SAMPLE_RULES : DEFAULT_VOICE}

${notes ? `${SOURCE_NOTES_RULES}\n\nSOURCE NOTES TO CHECK AGAINST:\n---\n${notes}\n---\n` : ""}
${GENERIC_PHRASE_BANS}

${PLAIN_SPOKEN_RULES}

ORIGINAL DRAFT:
---
${original}
---

CURRENT REWRITE:
---
${rewritten}
---

Return the final rewritten text only.`;
}
