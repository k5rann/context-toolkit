/**
 * Verbose paraphrase prompt v2 — fixes the literal-trailer-copying bug from v1.
 *
 * v1 issue: I provided example trailers ("if you want to keep going and feel
 * good about it", "so you can find weak spots") meant as templates. Gemini
 * pasted them verbatim into outputs where they didn't fit (a hydration bottle
 * description ending with "so you can find weak spots" was the symptom).
 *
 * v2 fix:
 *   - Describe trailers as a CATEGORY (purpose + tone) rather than literal strings
 *   - Require trailers to be derived from the input's own subject matter
 *   - Forbid reusing any example string verbatim
 *   - Move from "rule list with examples" to "principle list" so the model
 *     doesn't treat examples as a checklist to satisfy
 *
 * Still targets the same StealthWriter-observed patterns:
 *   anti-concision, clause wrapping, transitional fluff, mixed contractions,
 *   subject inversion, soft trailing qualifiers, reduced information density.
 */

export function buildVerbosePromptV2(text: string): string {
  return `You are rewriting AI-generated text so it reads like it was written by a human contributor for a mid-tier publication. The goal is NOT to sound informal. It's to sound less information-dense and less crisp than the AI original.

Apply ALL of the following principles. They are mandatory, not optional. The examples are illustrations of the PATTERN — never copy any example string verbatim. Any trailing phrase you add must be derived from THIS input's own subject matter.

PRINCIPLE 1 — Anti-concision.
Wherever the original is crisp, make it more roundabout. Take a tight phrase
and unfold it into a small clause that says roughly the same thing in more
words. Pattern (do not copy): "experienced team" becomes something like
"individuals who have spent considerable time in the field".

PRINCIPLE 2 — Clause wrapping.
Convert simple nouns into relative clauses where it fits the input's topic.
Pattern (do not copy): "approach" becomes "an approach that involves [something
specific to this input]". Pull the [something specific] from the input itself,
never from an example.

PRINCIPLE 3 — Transitional fluff at sentence and paragraph starts.
Use these connector openers, distributed naturally (do not stack them):
  Moreover, In addition, Also, Furthermore, Whether you're, If you are looking
  to, What makes [X] [Y] is, There are multiple, The first and foremost,
  In the end, As [X] continues to, With today's [X], Given the
Pick connectors that fit the input. Don't force them.

PRINCIPLE 4 — Mixed contractions.
Drop contractions in roughly 30% of clauses, keep them in 70%. Humans are
inconsistent here; LLMs default to uniform. Concretely: a paragraph with
five contraction opportunities should have one or two written out long-form.

PRINCIPLE 5 — Soft trailing qualifiers (CRITICAL — read carefully).
SOMETIMES end a sentence with a soft, hedging trailing clause that adds
length without adding information. The trailer MUST be:
  (a) derived from the input's own subject matter (if input is about
      hydration, the trailer talks about hydration or hydration's purpose),
  (b) never a stock phrase reused from another context,
  (c) used at most twice per paragraph — over-using them makes the text
      sound mechanical.
Pattern (do not copy literally): if the input is about cybersecurity defense,
a possible trailer is "...so that potential weak points can be identified
before they are exploited". If the input is about productivity habits, a
possible trailer is "...in a way that gradually shifts your day-to-day".
The TRAILER MUST BE TOPICAL. Never paste a trailer that doesn't fit the topic.

PRINCIPLE 6 — Subject inversion / pre-positioning.
Occasionally lead with the subject differently than the original. Common
patterns: "We at [Company]...", "What makes [X] [Y] is...", "With today's
[X]...". Use one or two per piece, not on every paragraph.

PRINCIPLE 7 — Lower information density.
The rewrite should be 10-40% LONGER than the input. Say less per word.
Use parallel verb patterns across clauses rather than collapsing them.
Pattern: instead of "improve operations and engagement" write something
like "make your operations smoother and make your customer interactions
feel more thoughtful".

PRINCIPLE 8 — Preserve every fact.
Names, numbers, products, claims, sequence of arguments — all preserved.
Do NOT invent information not in the input. Do NOT drop information.

PRINCIPLE 9 — Match paragraph count.
Same number of paragraphs as the input. Same overall structure.

PRINCIPLE 10 — Output protocol.
Output ONLY the rewritten text. No preamble. No "Here is the rewrite:". No
markdown labels. No commentary. No word count. No notes. Just the text.

PRINCIPLE 11 — Forbidden verbatim phrases.
Do NOT use any of these example strings literally in your output:
  "if you want to keep going and feel good about it"
  "so you can find weak spots"
  "when you're ready to give it a break"
  "in a way that puts people first"
  "in a way that keeps things running smoothly"
These were illustrative only. They are now off-limits in any output.

---

INPUT TO REWRITE:

${text}

---

REWRITTEN TEXT:`;
}
