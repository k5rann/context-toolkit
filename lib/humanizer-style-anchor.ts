import { generate } from "./llm";

export interface StyleAnchor {
  id: string;
  domain: "tech" | "academic" | "casual" | "business" | "general";
  label: string;
  text: string;
}

export interface StyleAnchorOptions {
  text: string;
  anchor?: StyleAnchor;
  anchorId?: string;
  apiKey: string;
  model?: string;
  temperature?: number;
}

export interface StyleAnchorResult {
  output: string;
  anchorUsed: string;
  model: string;
}

// Stealthwriter Pair 01 output — Copyleaks-verified at 0% AI / 100% Human.
// This is our strongest anchor: text that a real detector already accepted.
const STEALTHWRITER_ANCHOR: StyleAnchor = {
  id: "stealthwriter-01",
  domain: "tech",
  label: "Stealthwriter (Copyleaks-verified 0% AI)",
  text: `As seen in Figure 1, the ADAPT would work in a real financial institution. The system accepts live transaction data and cleans, normalizes and feature engineers the data, then it applies some techniques for anomaly detection. The two layers are the Isolation Forest layer for detecting anomalies at the individual customer level, and the graph-based layer for detecting suspicious relationships between accounts and transactions. The final fraud risk score is used to approve or reject transactions,`,
};

const ANCHORS: StyleAnchor[] = [
  STEALTHWRITER_ANCHOR,
  {
    id: "tech-blogger",
    domain: "tech",
    label: "Tech blog voice",
    text: `I spent three days trying to get the firewall rules right and kept locking myself out of SSH. Not fun. Turns out the issue wasn't even the iptables config, it was a stale NAT rule from when we migrated off the old VPN last March. The fix took about ten minutes once I found it. Security stuff is like that — you spend 90% of the time looking at the wrong layer. My advice to anyone setting up network segmentation for the first time: draw the packet flow on paper before you touch a single config file. Seriously. The fancy monitoring dashboards won't save you from a misconfigured default route.`,
  },
  {
    id: "academic-student",
    domain: "academic",
    label: "Undergrad essay voice",
    text: `The results from our experiment didn't match what we expected based on the literature. Williams (2018) predicted a correlation above 0.6 but we got 0.31, which is barely significant with our sample size of 47. Part of this might be because we ran the survey in April right during finals week and people were rushing through it. Professor Chen suggested we control for that next time. I think the bigger issue is that our operationalization of "engagement" was too broad — we counted any click as engagement but most of those were probably accidental. The next iteration should use time-on-page instead.`,
  },
  {
    id: "casual-forum",
    domain: "casual",
    label: "Forum / comment voice",
    text: `Look, I've been doing this for eight years and the one thing I can tell you is that nobody actually reads the documentation. They google the error message, find a Stack Overflow answer from 2019, copy the code, and move on. That's just how it works. The companies that figured this out are the ones with good error messages — Stripe, Vercel, even Cloudflare now. When something breaks it tells you WHAT broke and gives you a link to the specific docs page. Everything else is a waste of time.`,
  },
  {
    id: "business-email",
    domain: "business",
    label: "Professional email voice",
    text: `Hi Sarah, just wanted to follow up on the pricing discussion from Thursday. I talked to finance and they're okay with the 15% discount for the annual plan but only if we lock in the renewal rate for 2 years. The quarterly option is off the table — our margins don't work below the $4,200/month floor we discussed. Can you check with their procurement team and see if that works? If they push back on the 2-year lock, I have some flexibility on the implementation timeline that might help. Let me know by Friday if possible, the Q2 pipeline review is Monday.`,
  },
  {
    id: "general-nonfiction",
    domain: "general",
    label: "General nonfiction voice",
    text: `The building was supposed to open in September but they found asbestos in the east wing during the renovation. Classic. Now they're saying February at the earliest, which probably means April or May if we're being honest. The contractor blamed the original 1970s builders, which fair enough, but someone should have caught it during the inspection last year. Cost went from $2.3 million to somewhere north of $3 million — nobody will give me an exact number. The tenants on the third floor already moved out and I doubt they're coming back.`,
  },
];

// Hybrid prompt: style anchor + minimal anti-detection instructions.
// The anchor provides the voice target; the instructions kill specific
// AI tells that the model might still produce during style transfer.
export function buildHybridStylePrompt(
  text: string,
  anchor: StyleAnchor
): string {
  return `You write like this:
---
${anchor.text}
---

Rewrite the passage below in your voice. Same facts, same number of paragraphs.

Rules:
- Match the sentence rhythm and word choices of the sample above
- Use contractions naturally (don't force them everywhere)
- Mix short sentences (3-8 words) with longer ones (20+ words)
- Kill these AI trigger words entirely: robust, comprehensive, multifaceted, crucial, proactive, safeguarding, organizational resilience, threat landscape, digital age, pressing concern, critical infrastructure
- Replace formal verbs with plain ones: "implement" → "set up", "leverage" → "use", "facilitate" → "help"
- No em-dashes. Use periods, commas, or "but" instead
- End on a plain statement, not a grand conclusion
- Don't clean it up. Real writing has rough edges

---
${text}
---`;
}

// Aggressive stealth prompt — forces casual register, burstiness, and
// structural disruption to defeat document-level AI pattern detectors.
export function buildStealthPrompt(
  text: string,
  anchor: StyleAnchor
): string {
  return `Study this writing style — the rhythm, word choices, sentence length, and tone:
---
${anchor.text}
---

Now rewrite the COMPLETELY DIFFERENT passage below using that same STYLE. Do NOT use any facts, names, or topics from the style sample above. Only rewrite the passage below. Same facts as the passage. Totally different structure.

Hard rules (violating any = fail):
1. SENTENCE LENGTH VARIETY: alternate between very short (3-7 words) and medium (12-20 words). Never write two sentences of similar length in a row
2. CONTRACTIONS: use them in at least 40% of sentences. "it's", "don't", "that's", "they're", "won't"
3. FRAGMENTS ALLOWED: incomplete sentences are fine. "Just how it works." "Not great."
4. NO AI TRANSITION WORDS: never use "furthermore", "moreover", "additionally", "consequently", "significantly", "overall"
5. NO AI HEDGING: never use "it is important to note", "it is worth mentioning", "plays a crucial role", "in today's"
6. KILL THESE WORDS: robust, comprehensive, multifaceted, crucial, proactive, safeguarding, leverage, unprecedented, sophisticated, enhance, optimize, streamline, facilitate, utilize, paradigm, holistic, cutting-edge, state-of-the-art
7. PLAIN VERBS ONLY: "use" not "utilize", "help" not "facilitate", "set up" not "implement", "improve" not "enhance", "speed up" not "optimize"
8. START SENTENCES DIFFERENTLY: never start 2+ sentences the same way. Mix "The...", "It's...", "That...", "Look,", "So...", proper nouns, etc
9. BREAK PARALLEL STRUCTURE: if the original lists 3 things in the same grammatical form, rewrite them in different forms
10. NO SUMMARY ENDINGS: don't end with a grand takeaway or call to action. End mid-thought or on a specific detail
11. NO EM-DASHES: never use — or –. Use periods, commas, or "but" instead
12. NO COLONS IN SENTENCES: don't use colons to introduce lists or explanations

CRITICAL: Your output MUST be the same length as the input (within 5 words). If the input is 75 words, write 70-80 words. Do NOT summarize or shorten. Cover every point from the input. Write ONLY the rewritten text. No labels, no commentary.

---
${text}
---`;
}

const ANCHOR_BY_ID = new Map(ANCHORS.map((a) => [a.id, a]));

export function getAnchors(): StyleAnchor[] {
  return ANCHORS;
}

export function getAnchorById(id: string): StyleAnchor | undefined {
  return ANCHOR_BY_ID.get(id);
}

const DOMAIN_KEYWORDS: Record<StyleAnchor["domain"], RegExp[]> = {
  tech: [
    /\bcyber/i, /\bsecurity\b/i, /\bphishing\b/i, /\bransomware\b/i,
    /\bnetwork\b/i, /\bsoftware\b/i, /\binfrastructure\b/i, /\bAPI\b/,
    /\bserver/i, /\bcloud\b/i, /\bencrypt/i, /\bfirewall/i, /\bmalware/i,
    /\bdata\b/i, /\balgorithm/i, /\bmachine learning\b/i,
  ],
  academic: [
    /\bresearch\b/i, /\bstudy\b/i, /\bhypothes[ie]s\b/i, /\bcorrelation\b/i,
    /\bsample size\b/i, /\bstatistic/i, /\bpeer.review/i, /\bcitation/i,
    /\btheory\b/i, /\bexperiment\b/i, /\bmethodolog/i,
  ],
  casual: [
    /\bhonestly\b/i, /\bbasically\b/i, /\bpretty much\b/i, /\bwhatever\b/i,
    /\bkinda\b/i, /\bstuff\b/i, /\bthing is\b/i,
  ],
  business: [
    /\bROI\b/i, /\bquarter\b/i, /\bpipeline\b/i, /\bstakeholder/i,
    /\bbudget\b/i, /\bproposal\b/i, /\bcontract\b/i, /\bvendor\b/i,
    /\bprocurement\b/i, /\bmargin/i,
  ],
  general: [],
};

export function selectAnchor(text: string, preferredId?: string): StyleAnchor {
  if (preferredId) {
    const found = ANCHOR_BY_ID.get(preferredId);
    if (found) return found;
  }

  let bestDomain: StyleAnchor["domain"] = "general";
  let bestScore = 0;

  for (const [domain, patterns] of Object.entries(DOMAIN_KEYWORDS) as Array<
    [StyleAnchor["domain"], RegExp[]]
  >) {
    const score = patterns.filter((p) => p.test(text)).length;
    if (score > bestScore) {
      bestScore = score;
      bestDomain = domain;
    }
  }

  // For tech domain, prefer the stealthwriter anchor (Copyleaks-verified)
  if (bestDomain === "tech") return STEALTHWRITER_ANCHOR;

  const match = ANCHORS.find((a) => a.domain === bestDomain);
  return match ?? ANCHORS[ANCHORS.length - 1];
}

export function buildStyleAnchorPrompt(
  text: string,
  anchor: StyleAnchor
): string {
  return `You write like this:
---
${anchor.text}
---

Rewrite the passage below in your voice. Same facts, same length, same number of paragraphs. Don't clean it up or make it sound better. Just say it the way you'd say it.

---
${text}
---`;
}

// Two-stage prompt: style anchor rewrite followed by a degradation pass
// from a different model, mixing fingerprints like the existing chain.
export function buildStyleAnchorHop2Prompt(
  hop1Output: string,
  anchor: StyleAnchor
): string {
  return `Here is a sample of writing in a natural human voice:
---
${anchor.text}
---

Below is a draft that needs to sound more like the sample above. Adjust the word choices, sentence rhythm, and transitions to match that voice. Keep every fact and number. Don't add or remove information. Don't polish it — keep it slightly rough.

---
${hop1Output}
---`;
}

export async function rewriteWithStyleAnchor({
  text,
  anchor: explicitAnchor,
  anchorId,
  apiKey,
  model,
  temperature = 0.95,
}: StyleAnchorOptions): Promise<StyleAnchorResult> {
  const anchor = explicitAnchor ?? selectAnchor(text, anchorId);
  const prompt = buildStyleAnchorPrompt(text, anchor);
  const preferredModel = model ?? "gemini-2.5-flash";

  const output = await generate({
    apiKey,
    prompt,
    preferredModel,
    temperature,
  });

  return {
    output: output.trim(),
    anchorUsed: anchor.id,
    model: preferredModel,
  };
}

// Hybrid variant: style anchor + targeted anti-detection instructions.
export async function rewriteHybridStyleAnchor({
  text,
  anchor: explicitAnchor,
  anchorId,
  apiKey,
  model,
  temperature = 0.95,
}: StyleAnchorOptions): Promise<StyleAnchorResult> {
  const anchor = explicitAnchor ?? selectAnchor(text, anchorId);
  const prompt = buildHybridStylePrompt(text, anchor);
  const preferredModel = model ?? "gemini-2.5-flash";

  const output = await generate({
    apiKey,
    prompt,
    preferredModel,
    temperature,
  });

  return {
    output: output.trim(),
    anchorUsed: anchor.id,
    model: preferredModel,
  };
}

// Two-hop variant: style anchor rewrite → different model refinement.
// Mixes fingerprints across model families for lower detection.
export async function rewriteWithStyleAnchorChain({
  text,
  anchor: explicitAnchor,
  anchorId,
  apiKey,
  temperature = 0.95,
}: Omit<StyleAnchorOptions, "model">): Promise<
  StyleAnchorResult & { hop1Output: string }
> {
  const anchor = explicitAnchor ?? selectAnchor(text, anchorId);

  // Hop 1: Gemini rewrites with style anchor
  const hop1Prompt = buildStyleAnchorPrompt(text, anchor);
  const hop1Output = await generate({
    apiKey,
    prompt: hop1Prompt,
    preferredModel: "gemini-2.5-flash",
    temperature,
  });

  // Hop 2: DeepSeek refines toward anchor voice (different fingerprint family)
  const hop2Prompt = buildStyleAnchorHop2Prompt(hop1Output.trim(), anchor);
  const hop2Output = await generate({
    apiKey,
    prompt: hop2Prompt,
    preferredModel: "deepseek/deepseek-v4-flash",
    temperature: 0.9,
  });

  return {
    output: hop2Output.trim(),
    hop1Output: hop1Output.trim(),
    anchorUsed: anchor.id,
    model: "gemini-2.5-flash → deepseek/deepseek-v4-flash",
  };
}
