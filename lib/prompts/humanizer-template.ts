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

const TONE_GUIDES: Record<HumanizerTone, string> = {
  casual:
    "Friendly, conversational. Contractions are mandatory ('it's', 'doesn't', 'they're'). First-person singular is fine. Use everyday words. A short interjection or aside is welcome.",
  professional:
    "Clear, direct business writing. Confident — never hedge with 'might', 'could potentially', 'one could argue'. Short paragraphs. Active voice. No corporate filler.",
  academic:
    "Scholarly but human. Formal vocabulary is OK; AI-speak vocabulary is not. Vary sentence length. Occasional first-person ('I argue', 'this paper suggests') is fine if the original allows. No bullet-list cadence in flowing prose.",
  storytelling:
    "Narrative voice with personality. Concrete details over abstractions. Show, don't list. Light opinion is welcome. Lean into rhythm and beat — vary sentence length aggressively.",
};

const HUMANIZER_RULES = `RULES (non-negotiable):

1. **Vary sentence length aggressively.** Mix short, punchy sentences with longer, layered ones. AI writing has uniform sentence-length distribution; humans don't.

2. **Use contractions where natural.** "It's", "doesn't", "they're", "we'll". AI tends to write the formal forms; that's a giveaway.

3. **Cut AI-tells.** These words and phrases are red flags — remove or replace:
   - delve, delving, delved
   - tapestry, landscape (as metaphor), realm, journey (as metaphor)
   - moreover, furthermore, additionally, in addition
   - in conclusion, in summary, to summarize
   - it's important to note, it's worth noting, it's crucial to
   - navigate the complexities, navigate the nuances
   - in today's [world / society / digital age]
   - underscore, underscores, underscoring
   - foster, fostering (as in "foster collaboration")
   - leverage, leveraging (as a verb)
   - robust, seamless, holistic (as default adjectives)
   - embark on a journey, embark on
   - testament to, stands as a testament

4. **Avoid parallel structure pile-ups.** Don't write "First X. Second Y. Third Z." in flowing prose. Don't open three sentences in a row with the same word.

5. **Allow minor "imperfections".** Start a sentence with "And" or "But" sometimes. End on a fragment occasionally. Real humans do.

6. **Trim filler.** Cut "in order to" → "to". Cut "due to the fact that" → "because". Cut "a number of" → "several" or a real number.

7. **Add specificity where the original is vague** — but ONLY if it doesn't change meaning. "Many people" → "most readers" is OK if the original supports it. Inventing facts is not.

8. **Preserve meaning.** Keep all factual claims, numbers, names, citations, and structural points. Don't add new facts. Don't drop key points.

9. **Length.** Stay within 15% of the original word count either way.

10. **Output ONLY the rewritten text.** No commentary, no headers, no "Here is the rewritten version:". No quotation marks wrapping the output.`;

export function buildHumanizerPrompt(text: string, tone: HumanizerTone): string {
  const toneGuide = TONE_GUIDES[tone];
  return `You are a human-voice rewriter. Your job is to take AI-generated text and rewrite it so it reads as if a thoughtful human wrote it from scratch — natural rhythm, lived-in voice, no AI fingerprints.

${HUMANIZER_RULES}

TONE FOR THIS REWRITE: ${tone}
${toneGuide}

ORIGINAL TEXT:
---
${text}
---

REWRITTEN TEXT (output only the rewritten text, nothing else):`;
}
