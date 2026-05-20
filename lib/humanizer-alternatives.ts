import { generate } from "./llm";
import {
  selectAnchor,
  buildHybridStylePrompt,
  buildStealthPrompt,
  getAnchorById,
  type StyleAnchor,
} from "./humanizer-style-anchor";
import { postProcess } from "./humanizer-postprocess";
import {
  obfuscateTopicPhrases,
  countPoisonedPhrases,
} from "./humanizer-topic-obfuscator";
import { scoreHumanness } from "./humanizer-human-score";

// ── PREAMBLE STRIPPING ────────────────────────────────────────────────
// LLMs often prefix output with "Here's the rewritten passage:" or similar.
// Strip these before further processing.
const PREAMBLE_PATTERNS = [
  /^(?:here(?:'s| is) (?:the |a |my )?(?:rewritten|rewrite|revised|updated|humanized|modified|edited)[\w\s]*?(?:passage|text|version|output|content|paragraph|draft)?)\s*[:—\-–]\s*/i,
  /^(?:sure[,!]?\s*)?(?:here(?:'s| is)[\w\s]*?[:—\-–])\s*/i,
  /^(?:rewritten (?:passage|text|version|output))\s*[:—\-–]\s*/i,
  /^(?:output|result)\s*[:—\-–]\s*/i,
];

function stripPreamble(text: string): string {
  let cleaned = text.trim();
  for (const pattern of PREAMBLE_PATTERNS) {
    cleaned = cleaned.replace(pattern, "");
  }
  // Also strip leading/trailing --- fences
  cleaned = cleaned.replace(/^---\s*/gm, "").replace(/\s*---\s*$/gm, "").trim();
  return cleaned;
}

export interface SentenceAlternative {
  sentence: string;
  rank: number;
}

export interface SentenceEntry {
  id: number;
  original: string;
  alternatives: SentenceAlternative[];
}

export interface AlternativesResult {
  sentences: SentenceEntry[];
  composedOutput: string;
  anchorUsed: string;
  model: string;
  /** True when output is under Copyleaks' 350-char minimum */
  tooShort?: boolean;
  /** How many AI-saturated phrases were detected in the input */
  poisonedPhrasesDetected?: number;
  /** How many were actually swapped (some may be in non-obfuscated positions) */
  poisonedPhrasesSwapped?: number;
}

const AI_TRIGGER_WORDS = [
  "robust",
  "comprehensive",
  "multifaceted",
  "crucial",
  "proactive",
  "safeguarding",
  "organizational resilience",
  "threat landscape",
  "digital age",
  "pressing concern",
  "critical infrastructure",
  "fundamentally",
  "sophisticated",
  "leverage",
  "unprecedented",
  "posture",
  "furthermore",
  "moreover",
  "utilize",
  "facilitate",
  "implement",
  "enhance",
  "streamline",
  "optimize",
  "paradigm",
  "holistic",
  "synergy",
  "cutting-edge",
  "state-of-the-art",
  "in today's",
  "in the realm of",
  "it is worth noting",
  "it is important to note",
  "plays a crucial role",
  "navigating the complexities",
];

function splitSentences(text: string): string[] {
  const abbrevs =
    /(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|e\.g|i\.e|U\.S|U\.K)\./gi;
  const placeholder = "§ABBR§";
  let safe = text.replace(abbrevs, (m) => m.replace(".", placeholder));

  const raw = safe
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.replace(new RegExp(placeholder.replace(/[§]/g, "\\§"), "g"), "."))
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  return raw;
}

function scoreTriggers(text: string): number {
  const lower = text.toLowerCase();
  return AI_TRIGGER_WORDS.filter((w) => lower.includes(w)).length;
}

function rankAlternative(original: string, rewritten: string): number {
  const origTriggers = scoreTriggers(original);
  const newTriggers = scoreTriggers(rewritten);

  const triggerReduction =
    origTriggers > 0 ? (origTriggers - newTriggers) / origTriggers : 0.5;

  const origWords = original.split(/\s+/).length;
  const newWords = rewritten.split(/\s+/).length;
  const lengthRatio = newWords / Math.max(origWords, 1);
  const lengthPenalty =
    lengthRatio > 1.5 || lengthRatio < 0.3 ? 0.3 : 1.0;

  const isOriginal =
    original.trim().toLowerCase() === rewritten.trim().toLowerCase();
  if (isOriginal) return 0.01;

  const hasContractions = /\b\w+'\w+\b/.test(rewritten) ? 0.05 : 0;
  const vocabShift = original !== rewritten ? 0.3 : 0;

  const raw =
    triggerReduction * 0.5 + vocabShift + hasContractions + 0.15;
  return Math.min(0.999, Math.max(0.01, raw * lengthPenalty));
}

function buildSentencePrompt(
  sentence: string,
  anchor: StyleAnchor,
  variant: "heavy" | "medium" | "light"
): string {
  const rules: Record<typeof variant, string> = {
    heavy: `Rewrite this single sentence in your voice. Change the structure, swap out formal words for plain ones. Make it sound like something you'd actually say. Keep the facts.`,
    medium: `Rewrite this single sentence. Use simpler words where possible and adjust the phrasing, but keep the general structure. Same facts.`,
    light: `Lightly edit this sentence. Swap one or two formal words for plainer ones. Keep the structure mostly the same. Same facts.`,
  };

  return `You write like this:
---
${anchor.text}
---

${rules[variant]}

Kill these words entirely: robust, comprehensive, multifaceted, crucial, proactive, safeguarding, leverage, unprecedented, furthermore, moreover, utilize, facilitate, paradigm, holistic, synergy, cutting-edge, state-of-the-art

Sentence:
${sentence}

Rewritten sentence (just the sentence, nothing else):`;
}

export async function generateAlternatives({
  text,
  apiKey,
  anchorId,
  model = "gemini-2.5-flash",
  temperatures = [0.95, 0.8, 0.6],
}: {
  text: string;
  apiKey: string;
  anchorId?: string;
  model?: string;
  temperatures?: number[];
}): Promise<AlternativesResult> {
  // Pre-process: strip topic-saturated phrases that trigger Copyleaks AI
  // Source Match. The LLM never sees the original loaded n-grams, so it
  // can't echo them back. This is the key fix for poisoned topics
  // (cybersecurity, AI, urban planning, etc.).
  const obfuscationSeed = Date.now() % 1000;
  const { output: obfuscatedText, swapCount } = obfuscateTopicPhrases(
    text,
    obfuscationSeed
  );
  const poisonedCount = countPoisonedPhrases(text);

  const anchor = selectAnchor(obfuscatedText, anchorId);
  const inputSentences = splitSentences(obfuscatedText);
  const variants: Array<"heavy" | "medium" | "light"> = [
    "heavy",
    "medium",
    "light",
  ];

  // Full-doc rewrite uses Llama 70B via OpenRouter + casual anchor.
  // ADVERSARIAL SAMPLING: generate 3 variants at different temperatures,
  // score each with local human-likeness heuristic, pick the best,
  // then run hop-2 through DeepSeek to mix model fingerprints.
  const stealthAnchor = getAnchorById("casual-forum") ?? anchor;
  const orKey = process.env.OPENROUTER_API_KEY ?? "";
  const stealthModel = "meta-llama/llama-3.1-70b-instruct";
  const hop2Model = "deepseek/deepseek-chat";
  // 5 temperature points for richer adversarial pool. All run in parallel
  // so wall-clock latency is unchanged from 3 variants — just more API calls.
  const stealthTemps = [0.95, 1.05, 1.15, 1.25, 1.35];
  const fullDocPromise = (async () => {
    try {
      const fullPrompt = buildStealthPrompt(obfuscatedText, stealthAnchor);
      const candidates = await Promise.all(
        stealthTemps.map(async (temp) => {
          try {
            const raw = await generate({
              apiKey: orKey || apiKey,
              prompt: fullPrompt,
              preferredModel: stealthModel,
              temperature: temp,
              timeoutMs: 45000,
            });
            const cleaned = stripPreamble(raw);
            if (cleaned.length < 50) return null;
            return { text: cleaned, score: scoreHumanness(cleaned).total, temp };
          } catch {
            return null;
          }
        })
      );

      const valid = candidates.filter(
        (c): c is { text: string; score: number; temp: number } => c !== null
      );
      if (valid.length === 0) return null;

      valid.sort((a, b) => b.score - a.score);
      const hop1Output = valid[0].text;

      // HOP 2: feed Llama's best variant through DeepSeek for fingerprint mixing.
      // Each model family leaves different statistical artifacts; layering two
      // models scrambles those artifacts so detectors can't identify either.
      try {
        const hop2Prompt = `Take this passage and rewrite it in your own words. Keep every fact and number exactly the same. Make it sound like a real person talking, not polished writing. Don't use em-dashes, fancy transition words like "furthermore", or formal phrases. Use contractions. Mix short and long sentences. Don't summarize or shorten — match the input length.

---
${hop1Output}
---

Rewritten:`;
        const hop2Raw = await generate({
          apiKey: orKey || apiKey,
          prompt: hop2Prompt,
          preferredModel: hop2Model,
          temperature: 1.0,
          timeoutMs: 45000,
        });
        const hop2Clean = stripPreamble(hop2Raw);
        // Only use hop-2 if it's a reasonable length (not too short, not too long)
        const lenRatio = hop2Clean.length / hop1Output.length;
        if (hop2Clean.length > 50 && lenRatio > 0.5 && lenRatio < 2.0) {
          // Score hop-2 vs hop-1, take whichever scores higher
          const hop2Score = scoreHumanness(hop2Clean).total;
          const hop1Score = valid[0].score;
          if (hop2Score > hop1Score) {
            return splitSentences(hop2Clean);
          }
        }
      } catch {
        // Fall through to hop-1 output
      }

      return splitSentences(hop1Output);
    } catch {
      return null;
    }
  })();

  const perSentencePromise = Promise.all(
    inputSentences.map(async (original) => {
      const altPromises = variants.map(async (variant, vi) => {
        const prompt = buildSentencePrompt(original, anchor, variant);
        const temp = temperatures[vi] ?? temperatures[0];
        try {
          const raw = await generate({
            apiKey,
            prompt,
            preferredModel: model,
            temperature: temp,
            timeoutMs: 15000,
          });
          return stripPreamble(raw)
            .replace(/^["']|["']$/g, "")
            .replace(/^\*\*.*?\*\*\s*:?\s*/, "")
            .trim();
        } catch {
          return null;
        }
      });
      return Promise.all(altPromises);
    })
  );

  const [fullDocSentences, perSentenceResults] = await Promise.all([
    fullDocPromise,
    perSentencePromise,
  ]);

  const sentenceEntries: SentenceEntry[] = inputSentences.map(
    (original, idx) => {
      const alternatives: SentenceAlternative[] = [];

      // Full-doc rewrite gets a rank boost — it breaks document-level patterns
      if (fullDocSentences && fullDocSentences[idx]) {
        const fullAlt = fullDocSentences[idx];
        if (fullAlt.length > 5) {
          const baseRank = rankAlternative(original, fullAlt);
          alternatives.push({
            sentence: fullAlt,
            rank: Math.min(0.999, baseRank + 0.1),
          });
        }
      }

      // Per-sentence variants
      for (const rewritten of perSentenceResults[idx]) {
        if (rewritten && rewritten.length > 5) {
          alternatives.push({
            sentence: rewritten,
            rank: rankAlternative(original, rewritten),
          });
        }
      }

      alternatives.push({
        sentence: original,
        rank: rankAlternative(original, original),
      });

      alternatives.sort((a, b) => b.rank - a.rank);
      return { id: idx, original, alternatives };
    }
  );

  const rawComposed = sentenceEntries
    .map((e) => e.alternatives[0]?.sentence ?? e.original)
    .join(" ");

  // Second pass of topic obfuscation — catches phrases the LLM regenerated
  // despite the input being scrubbed. Different seed so we don't repeat
  // the exact same paraphrases from input pre-processing.
  const { output: scrubbedComposed } = obfuscateTopicPhrases(
    rawComposed,
    (obfuscationSeed + 137) % 1000
  );

  // Final post-process pass on the composed output for document-level noise
  const composedOutput = postProcess(scrubbedComposed, {
    seed: (Date.now() + 42) % 1000,
    fillers: false, // Already injected at sentence level
    burstiness: true,
    paragraphs: true,
    vocabPerturb: true,
  });

  const MIN_OUTPUT_CHARS = 350;
  return {
    sentences: sentenceEntries,
    composedOutput,
    anchorUsed: anchor.id,
    model,
    tooShort: composedOutput.length < MIN_OUTPUT_CHARS,
    poisonedPhrasesDetected: poisonedCount,
    poisonedPhrasesSwapped: swapCount,
  };
}

export async function generateAlternativesFull({
  text,
  apiKey,
  anchorId,
  model = "gemini-2.5-flash",
}: {
  text: string;
  apiKey: string;
  anchorId?: string;
  model?: string;
}): Promise<AlternativesResult> {
  const anchor = selectAnchor(text, anchorId);
  const inputSentences = splitSentences(text);

  const fullPrompt = buildHybridStylePrompt(text, anchor);
  const fullOutput = await generate({
    apiKey,
    prompt: fullPrompt,
    preferredModel: model,
    temperature: 0.95,
    timeoutMs: 30000,
  });
  const fullSentences = splitSentences(fullOutput.trim());

  const sentenceEntries: SentenceEntry[] = inputSentences.map(
    (original, idx) => {
      const fullAlt = fullSentences[idx] ?? original;
      const alternatives: SentenceAlternative[] = [
        {
          sentence: fullAlt,
          rank: rankAlternative(original, fullAlt),
        },
        {
          sentence: original,
          rank: rankAlternative(original, original),
        },
      ];
      alternatives.sort((a, b) => b.rank - a.rank);
      return { id: idx, original, alternatives };
    }
  );

  const composedOutput = sentenceEntries
    .map((e) => e.alternatives[0]?.sentence ?? e.original)
    .join(" ");

  return {
    sentences: sentenceEntries,
    composedOutput,
    anchorUsed: anchor.id,
    model,
  };
}
