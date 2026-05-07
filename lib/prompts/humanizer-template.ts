export type HumanizerTone =
  | "casual"
  | "academic"
  | "professional"
  | "storytelling";

export const TONES: Array<{
  id: HumanizerTone;
  label: string;
  short: string;
  description: string;
}> = [
  {
    id: "casual",
    label: "Casual",
    short: "Conversational, friendly",
    description:
      "Like texting a smart friend. Contractions mandatory. Light, warm, occasional opinion.",
  },
  {
    id: "professional",
    label: "Professional",
    short: "Clean business writing",
    description:
      "Direct, confident, no hedging. Active voice. Short paragraphs. Built for execs and clients.",
  },
  {
    id: "academic",
    label: "Academic",
    short: "Scholarly but human",
    description:
      "Formal vocabulary, natural rhythm. Suited for essays, research writing, course papers.",
  },
  {
    id: "storytelling",
    label: "Storytelling",
    short: "Narrative voice",
    description:
      "Voicy, opinionated, concrete. Show, don't list. Best for blog posts, op-eds, scripts.",
  },
];

// Personas push the model toward high-perplexity word choices and away from
// generic-essay shape. Each persona is a real-feeling author voice the model
// can imitate, which disrupts the default-AI output distribution.
const PERSONAS: Record<HumanizerTone, string> = {
  casual:
    "You are a 24-year-old who blogs sometimes. You write the way you talk: direct, specific, unimpressed by jargon. You use em-dashes when a thought interrupts itself. You drop in mid-sentence parentheticals (small ones). You aren't afraid of sentence fragments. You'd rather sound like you than sound smart.",
  professional:
    "You are a senior product manager writing a short internal memo to peers who already know the basics. Direct, dense, zero padding. You favor specific examples over abstractions. You name the trade-off when there is one. You don't hedge; you commit. Short paragraphs. No corporate filler.",
  academic:
    "You are a third-year graduate student writing a course response paper at 11pm. You think in arguments and counter-arguments. You hedge precisely — not with 'might' or 'could', but with 'I'd argue', 'this suggests', 'on this reading'. You use concrete examples and name authors or studies when relevant. You write in paragraphs, not bullet points. Your prose has rhythm because you read it back to yourself.",
  storytelling:
    "You are a writer with a distinct voice — opinionated, observational, willing to be wrong out loud. You favor concrete sensory detail over abstractions. You use em-dashes, asides, and the occasional one-sentence paragraph for impact. You aren't trying to impress; you're trying to be heard. A reader should feel a person on the other side of the page.",
};

const TONE_REGISTER: Record<HumanizerTone, string> = {
  casual:
    "Conversational. Contractions are required (it's, doesn't, they're). First person is fine. Filler words used sparingly — 'really', 'actually', 'honestly' once per piece, not once per sentence.",
  professional:
    "Direct business register. Active voice. Specific over generic ('the migration broke prod' beats 'an issue emerged'). Limited contractions. No exclamation points.",
  academic:
    "Formal vocabulary, natural rhythm. Limited contractions. First-person 'I argue' or 'this paper claims' is permitted. Vary sentence length aggressively. No bullet-list cadence in flowing prose.",
  storytelling:
    "Narrative register. Concrete details, sensory specificity, willingness to slow down. Strong verbs, fewer adverbs. Subjective opinion is welcome.",
};

const ANTI_PATTERN_INJECTION = `HUMAN-SHAPE INJECTIONS (use at least THREE of these — pick the ones that fit the tone):

- Mid-sentence em-dash interjection — like this — to break uniform rhythm
- One short sentence fragment. Or two.
- A small parenthetical aside (specific, not generic)
- Open a sentence with And, But, So, or Yet
- Drop in one unexpected concrete example, name, or number where the original was vague
- Vary paragraph length — include at least one short paragraph (1-2 sentences) if the input is multi-paragraph
- Use one rhythm-breaker: a colon, a semicolon, or a question
- One word that's slightly unusual — not jargon, just specific (e.g. "lopsided" instead of "uneven", "wedged" instead of "stuck")`;

const ABSOLUTE_BANS = `ABSOLUTE BANS — these phrases must NOT appear in the output, no exceptions:

- delve, delving, delved
- tapestry, landscape (as metaphor), realm, journey (as metaphor)
- moreover, furthermore, additionally, in addition
- in conclusion, in summary, to summarize
- it's important to note, it's worth noting, it's crucial to
- navigate the complexities, navigate the nuances
- in today's [world / society / digital age], in recent years
- underscore, underscores, underscoring
- foster, fostering (as in "foster collaboration / X")
- leverage, leveraging (as a verb)
- robust, seamless, holistic, multifaceted (as default adjectives)
- testament to, stands as a testament
- embark on a journey, embark on
- as we [move into / look toward / continue], looking ahead
- ushering in, usher in
- pivotal, paramount, crucial (as default intensifiers)
- not just X, but Y construction (overused)
- "X offers several key benefits" framing line
- "First, ... Second, ... Third, ..." rigid enumeration in flowing prose
- Three or more sentences in a row that share a starting word`;

const STRUCTURAL_RULES = `STRUCTURAL RULES (non-negotiable):

1. **Vary sentence length aggressively.** Mix short punchy sentences with longer layered ones. AI writing has uniform sentence-length distribution; humans don't.
2. **Vary sentence opening.** No three sentences in a row starting with the same word or grammatical pattern.
3. **Replace abstract nouns with grounded specifics where possible.** "Personalized learning" → "lessons that adapt as students miss questions." Only when the meaning is preserved.
4. **Preserve all factual claims, numbers, names, citations, and key structural points.** Do not invent new facts. Do not drop key points.
5. **Length: stay within 15% of the original word count either way.** Aim to match the input length.
6. **Output ONLY the rewritten text.** No commentary, no headers, no "Here is the rewritten version:". No surrounding quotation marks.`;

export function buildRewritePrompt(
  text: string,
  tone: HumanizerTone
): string {
  const persona = PERSONAS[tone];
  const register = TONE_REGISTER[tone];
  return `${persona}

Your task: rewrite the AI-generated text below in your voice. The result must read as if a person wrote it, not a model. Detectors look at perplexity (predictable next words) and burstiness (sentence-length variance) — your job is to disrupt both while preserving the meaning.

${STRUCTURAL_RULES}

${ABSOLUTE_BANS}

${ANTI_PATTERN_INJECTION}

REGISTER FOR THIS REWRITE:
${register}

ORIGINAL TEXT:
---
${text}
---

REWRITTEN TEXT (output only the rewritten text, nothing else):`;
}

export function buildCriticRevisePrompt(
  rewritten: string,
  tone: HumanizerTone,
  originalWordCount: number
): string {
  const register = TONE_REGISTER[tone];
  const minWords = Math.floor(originalWordCount * 0.85);
  const maxWords = Math.ceil(originalWordCount * 1.15);

  return `You are reviewing a rewrite that is meant to read as human-written. Your job is to find any remaining "AI-shape" signals and revise ONLY the affected sentences. Do not rewrite the whole text. Return the full revised text with your fixes inline.

AI-SHAPE SIGNALS TO HUNT:

1. **Uniform sentence length.** Three or more sentences in a row of similar length? Break the pattern by merging or splitting.
2. **Parallel structure pile-up.** "It does X. It supports Y. It enables Z." → flow them into one varied sentence.
3. **Generic essay-opening phrases.** "X is now reaching into...", "In recent years...", "X has transformed..." — replace with a specific opening.
4. **Conclusion-shape lines.** "As we move into...", "This points to a broader...", "Looking ahead..." — cut them or replace with a concrete final beat.
5. **Abstract nouns without grounding.** "Personalized learning", "broader transformation", "inclusive education" — at least one should become concrete (an example, a number, a named instance).
6. **Predictable next-word sentences.** If a sentence reads like every word is the most-probable choice, swap one mid-sentence word for a slightly less expected (still natural) one.
7. **No em-dashes, no fragments, no parentheticals anywhere?** Add at least one of each across the piece.
8. **Banned phrases that survived from the rewrite step:** delve, tapestry, landscape (metaphor), realm, journey (metaphor), moreover, furthermore, additionally, in conclusion, it's important to note, navigate the complexities, underscores, foster, leverage, robust, seamless, holistic, testament, ushering, pivotal, paramount.

REGISTER TO PRESERVE: ${register}

LENGTH CONSTRAINT: keep output between ${minWords} and ${maxWords} words (target: ${originalWordCount}). If the input is outside this range, restore length while applying fixes.

DRAFT TO REVISE:
---
${rewritten}
---

Output the full revised text only. No commentary, no headers, no preamble.`;
}
