import { generate } from "./llm";
import { BUNDLER_TEMPLATE } from "./prompts/bundler-template";
import { MODE_PROMPTS } from "./prompts/modes";

const MAX_RETRIES = 2;

// Detection patterns: [regex, label]
const BANNED_WORD_PATTERNS: Array<[RegExp, string]> = [
  [/\bconceptual\w*\b/gi, "conceptual*"],
  [/\bconsider(?:ed|ing|ation|ations|s)?\b/gi, "consider*"],
  [/\bpotentially\b/gi, "potentially"],
  [/\bideally\b/gi, "ideally"],
  [/\bessentially\b/gi, "essentially"],
  [/\bhigh-level\b/gi, "high-level"],
  [/\bapproximate(?:ly|d)?\b/gi, "approximate*"],
  [/\bpseudocode\b/gi, "pseudocode"],
  [/\byou might\b/gi, "you might"],
  [/\bcould potentially\b/gi, "could potentially"],
  [/\bfeel free to\b/gi, "feel free to"],
  [/\bas needed\b/gi, "as needed"],
];

// Surgery replacements (LAST-RESORT after retries fail)
// Order matters — longer/compound patterns first
const BANNED_SURGERY: Array<[RegExp, string]> = [
  [/\bcould potentially\b/gi, "may"],
  [/\bfeel free to\b/gi, "you may"],
  [/\byou might\b/gi, "you must"],
  [/\bas needed\b/gi, "when relevant"],
  [/\bhigh-level\b/gi, "broad"],
  [/\bpotentially\b/gi, ""],
  [/\bideally\b/gi, ""],
  [/\bessentially\b/gi, ""],
  [/\bconceptually\b/gi, "structurally"],
  [/\bconceptualize\b/gi, "design"],
  [/\bconceptual\b/gi, "structural"],
  [/\bconsiderations?\b/gi, "factors"],
  [/\bconsidering\b/gi, "given"],
  [/\bconsidered\b/gi, "reviewed"],
  [/\bconsiders?\b/gi, "reviews"],
  [/\bapproximately\b/gi, "around"],
  [/\bapproximated\b/gi, "estimated"],
  [/\bapproximate\b/gi, "rough"],
  [/\bpseudocode\b/gi, "code"],
];

// Suspicious reference patterns
const SUSPICIOUS_REF_PATTERNS: Array<[RegExp, string]> = [
  [
    /\([^)]*(?:Blog Post|Article|Tutorial|Guide|Comparison|Documentation|Resource)[^)]*\)/gi,
    "parenthetical category label",
  ],
  [
    /vs\.?\s+\w[\w.\s]*:\s*A\s+(?:Deep\s+Dive|Practical\s+Guide|Developer's?\s+Perspective|Comparison)/gi,
    "'X vs Y: A Deep Dive' template",
  ],
  [/:\s*A\s+Developer'?s\s+Perspective\b/gi, "'A Developer's Perspective' template"],
  [/\*\*[A-Z][\w.]*\s+for\s+[A-Z][\w\s-]+:?\*\*/g, "'X for [Use Case]' template title"],
];

const REFERENCES_SECTION_RE =
  /(?:^|\n)(?:Reference [Ww]orks?:?\s*\n)((?:\s*[*\-]\s+.+\n?)+)/gm;

export interface Violation {
  matched: string;
  label: string;
}

export interface AttemptHistory {
  attempt: number;
  violations: Violation[];
  suspicious_refs: Violation[];
  word_count: number;
}

export interface BundleResult {
  output: string;
  raw_output: string;
  meta_prompt: string;
  attempts: number;
  history: AttemptHistory[];
  violations: Violation[];
  suspicious_refs: Violation[];
  surgery_replacements: Array<{ original: string; replacement: string }>;
  refs_stripped: boolean;
  clean: boolean;
  cleanup_applied: boolean;
}

function findViolations(
  text: string,
  patterns: Array<[RegExp, string]>
): Violation[] {
  const found: Violation[] = [];
  for (const [pattern, label] of patterns) {
    const re = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      found.push({ matched: match[0], label });
      if (match.index === re.lastIndex) re.lastIndex++;
    }
  }
  return found;
}

function applySurgery(text: string): {
  cleaned: string;
  replacements: Array<{ original: string; replacement: string }>;
} {
  const replacements: Array<{ original: string; replacement: string }> = [];
  let cleaned = text;
  for (const [pattern, replacement] of BANNED_SURGERY) {
    cleaned = cleaned.replace(pattern, (match) => {
      replacements.push({ original: match, replacement });
      return replacement;
    });
  }
  // Tidy artifacts from deletions
  cleaned = cleaned.replace(/ {2,}/g, " ");
  cleaned = cleaned.replace(/ +([,.;:])/g, "$1");
  cleaned = cleaned.replace(/\(\s+/g, "(");
  cleaned = cleaned.replace(/\s+\)/g, ")");
  return { cleaned, replacements };
}

function stripReferencesSection(text: string): {
  stripped: string;
  wasStripped: boolean;
} {
  if (REFERENCES_SECTION_RE.test(text)) {
    REFERENCES_SECTION_RE.lastIndex = 0;
    return { stripped: text.replace(REFERENCES_SECTION_RE, "\n"), wasStripped: true };
  }
  return { stripped: text, wasStripped: false };
}

export interface BundleOptions {
  userInput: string;
  extraContext?: string;
  modes?: string[];
  cleanup?: boolean;
  apiKey: string;
}

export async function bundle({
  userInput,
  extraContext = "",
  modes = [],
  cleanup = true,
  apiKey,
}: BundleOptions): Promise<BundleResult> {
  const baseExtra = extraContext.trim();
  let lastMetaPrompt = "";
  let output = "";
  const history: AttemptHistory[] = [];

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const retryNotes: string[] = [];
    if (attempt > 0 && history.length > 0) {
      const prev = history[history.length - 1];
      if (prev.violations.length > 0) {
        const words = Array.from(
          new Set(prev.violations.map((v) => v.matched.toLowerCase()))
        ).sort();
        retryNotes.push(
          `CRITICAL RETRY ${attempt + 1} of ${MAX_RETRIES + 1}. Your previous draft used these BANNED words: ${words.join(", ")}. Rewrite WITHOUT any of them. No paraphrasing — completely remove. This is enforced by automated checks.`
        );
      }
      if (prev.suspicious_refs.length > 0) {
        retryNotes.push(
          `CRITICAL RETRY ${attempt + 1} of ${MAX_RETRIES + 1}. Your Reference Works section looks fabricated. OMIT the entire Reference Works section. Do not invent titles. Better to have no references than fake ones.`
        );
      }
    }

    const mergedExtra =
      [baseExtra, ...retryNotes].filter(Boolean).join("\n\n") || "(none provided)";

    lastMetaPrompt = BUNDLER_TEMPLATE.replace("{user_input}", userInput.trim()).replace(
      "{extra_context}",
      mergedExtra
    );

    output = await generate({ apiKey, prompt: lastMetaPrompt });
    const violations = findViolations(output, BANNED_WORD_PATTERNS);
    const suspicious_refs = findViolations(output, SUSPICIOUS_REF_PATTERNS);

    history.push({
      attempt: attempt + 1,
      violations,
      suspicious_refs,
      word_count: output.split(/\s+/).filter(Boolean).length,
    });

    if (violations.length === 0 && suspicious_refs.length === 0) break;
  }

  const raw_output = output;
  let surgery_replacements: Array<{ original: string; replacement: string }> = [];
  let refs_stripped = false;

  if (cleanup) {
    if (findViolations(output, BANNED_WORD_PATTERNS).length > 0) {
      const result = applySurgery(output);
      output = result.cleaned;
      surgery_replacements = result.replacements;
    }
    if (findViolations(output, SUSPICIOUS_REF_PATTERNS).length > 0) {
      const result = stripReferencesSection(output);
      output = result.stripped;
      refs_stripped = result.wasStripped;
    }
  }

  const final_violations = findViolations(output, BANNED_WORD_PATTERNS);
  const final_suspicious = findViolations(output, SUSPICIOUS_REF_PATTERNS);
  const is_clean = final_violations.length === 0 && final_suspicious.length === 0;

  // Append selected modes
  for (const mode of modes) {
    if (MODE_PROMPTS[mode]) {
      output = output.trimEnd() + "\n\n" + MODE_PROMPTS[mode].trimEnd() + "\n";
    }
  }

  return {
    output,
    raw_output,
    meta_prompt: lastMetaPrompt,
    attempts: history.length,
    history,
    violations: final_violations,
    suspicious_refs: final_suspicious,
    surgery_replacements,
    refs_stripped,
    clean: is_clean,
    cleanup_applied: cleanup,
  };
}
