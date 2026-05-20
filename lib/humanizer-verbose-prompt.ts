/**
 * Verbose paraphrase prompt — reverse-engineered from StealthWriter outputs
 * that scored 0% AI on Copyleaks (pair-03 business-copy, casual-blog).
 *
 * The hypothesis (validated 2026-05-18): Copyleaks penalizes information-dense,
 * crisp AI text. It does NOT primarily penalize "AI trigger words" — pair-06
 * uses "game-changer" and "cutting-edge" and still beats the detector.
 *
 * What StealthWriter's working outputs share:
 *   1. Anti-concise paraphrasing (wrap simple ideas in clauses)
 *   2. Mid-register verbosity (not academic, not casual — Wikipedia-ish)
 *   3. Transitional fluff (Moreover, In addition, Whether...)
 *   4. Mixed contractions (drops them in ~30% of clauses)
 *   5. Soft qualifying trailers (in a way that…, when you're ready to…)
 *   6. Subject inversion / pre-positioning (We at X, What makes us X)
 *   7. Lower information-per-word ratio than the AI original
 *
 * This preset prompts Gemini to apply all of these explicitly, with
 * concrete examples drawn from the 6 known-working StealthWriter outputs.
 */

export function buildVerbosePrompt(text: string): string {
  return `You are rewriting AI-generated text so it reads like it was written by a human contributor for a mid-tier publication. The goal is not to sound informal — it's to sound LESS information-dense and LESS concise than the AI original. Detectors penalize crisp, predictable phrasing; they reward roundabout, qualifier-heavy text.

Apply ALL of the following rules. Treat them as required, not optional.

RULE 1 — Anti-concision (expand crisp phrasing).
Whenever the original is tight, make it roundabout.
  - "experienced team" → "individuals who have been in the business"
  - "build custom systems" → "build custom systems using the latest tech, data insights, and industry expertise"
  - "ensure X" → "ensure what X wants is achieved"
  - "remote work" → "everyone working from home and being on at every moment"
  - "self-care isn't optional" → "your mind and your body isn't an option it's a requirement"

RULE 2 — Clause wrapping (turn nouns into relative clauses).
  - "approach" → "an approach that involves..."
  - "tools" → "tools that watch network activity"
  - "method" → "the method that helps you..."

RULE 3 — Transitional fluff at sentence/paragraph starts.
Use these openers frequently and naturally:
  Moreover, In addition, Also, Whether you're, If you are looking to,
  What makes [X] [Y] is, There are multiple, The first and foremost,
  In the end, As [X] continues to, With today's [X], Given the
Do not overuse any single one — distribute.

RULE 4 — Mixed contractions (drop them strategically).
Drop contractions in roughly 30% of cases. Keep them in 70%.
  - Keep: "it's", "you're", "won't"
  - Drop: "is not", "do not", "cannot", "is becoming"
The goal is inconsistency. Humans are inconsistent here; LLMs default to uniform.

RULE 5 — Soft trailing qualifiers.
End sentences and paragraphs with soft, hedging trailers:
  "...in a way that puts people first"
  "...when you're ready to give it a break"
  "...if you want to keep going and feel good about it"
  "...so they can find weak spots"
These add length without adding information.

RULE 6 — Subject inversion / pre-positioning.
Occasionally lead with the subject differently than the AI original:
  - "At Apex, we provide..." → "We at Apex provide..."
  - "Apex is committed to excellence" → "What makes Apex special is..."
  - "Cybersecurity is critical" → "With this dynamic landscape, cybersecurity is..."

RULE 7 — Lower information density.
The rewrite should be 5–15% LONGER than the input. Say less per word.
Repeat the verb pattern across parallel clauses rather than collapsing
("make your business run better, make your customers happier" — not "improve operations and engagement").

RULE 8 — Preserve every fact.
Names, numbers, products, claims, sequence of arguments — all preserved.
Do NOT add information not present in the input. Do NOT drop information.

RULE 9 — Match paragraph count.
Same number of paragraphs as the input. Same overall structure.

RULE 10 — Output protocol.
Output ONLY the rewritten text. No preamble. No "Here's the rewrite:". No
markdown labels. No commentary. No word count. No notes. Just the text.

---

INPUT TO REWRITE:

${text}

---

REWRITTEN TEXT:`;
}
