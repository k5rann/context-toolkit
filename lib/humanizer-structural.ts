// Structural transforms: clause-level rewrites observed in Pair 01
// (Copyleaks-verified 0% AI). These are deliberately conservative —
// every rule is high-precision so it can't false-positive on adjacent
// patterns. Risky transforms (active→infinitive on arbitrary clauses,
// gerund chain→verb chain) are NOT included because they require
// parsing, not regex.
//
// Why structural matters: lexical dict alone leaves AI-typical clause
// shapes intact (subordinate "while", noun-heavy gerund chains, "It is
// crucial that"). Pair 01 won 0% AI partly by restructuring those.

export interface StructuralOptions {
  joinWhileToAnd?: boolean;
  reframeFigureOpener?: boolean;
  dropItIsCrucialThat?: boolean;
  dropItIsEssentialThat?: boolean;
  collapseLitotes?: boolean;
  reframeInTodaysOpener?: boolean;
}

export interface StructuralCounts {
  whileToAnd: number;
  figureReframe: number;
  itIsCrucialDrop: number;
  itIsEssentialDrop: number;
  litotesCollapse: number;
  inTodaysReframe: number;
  total: number;
}

type Rule = {
  name: keyof Omit<StructuralCounts, "total">;
  pattern: RegExp;
  replacement: string | ((match: string, ...args: unknown[]) => string);
  enabledKey: keyof StructuralOptions;
};

// Subordinate "while" → coordinate "and" (only between two main clauses
// separated by a comma, not at sentence start, not "for a while" idiom).
// Guard: must be preceded by comma + space, and the clause after must
// have a subject before its verb (we approximate by requiring a
// determiner/pronoun/proper-noun-looking word).
const WHILE_TO_AND: Rule = {
  name: "whileToAnd",
  enabledKey: "joinWhileToAnd",
  pattern: /,\s+while\s+(the|a|an|this|these|those|it|they|he|she|we|you|i|[A-Z][a-z]+)\s/g,
  replacement: ", and $1 ",
};

// "Figure N shows how X" → "As seen in Figure N, X". Niche but
// high-confidence and unambiguous.
const FIGURE_REFRAME: Rule = {
  name: "figureReframe",
  enabledKey: "reframeFigureOpener",
  pattern: /\bFigure\s+(\d+)\s+shows\s+how\s+/g,
  replacement: "As seen in Figure $1, ",
};

// "It is crucial that X" → "X is essential" form — drop the framing
// and rely on remaining sentence carrying weight. Conservative form:
// only when followed by [SUBJ] [VERB], keep [SUBJ] [VERB] and prepend
// nothing. The dict already lowercases "It is crucial that" → "" but
// here we do the structural reframe to keep "essential" meaning.
const IT_IS_CRUCIAL_DROP: Rule = {
  name: "itIsCrucialDrop",
  enabledKey: "dropItIsCrucialThat",
  pattern: /\bIt\s+is\s+crucial\s+that\s+/g,
  replacement: "It's essential that ",
};

const IT_IS_ESSENTIAL_DROP: Rule = {
  name: "itIsEssentialDrop",
  enabledKey: "dropItIsEssentialThat",
  pattern: /\bIt\s+is\s+essential\s+to\s+recognize\s+that\s+/g,
  replacement: "It's important to understand that ",
};

// Litotes → direct: "is not without its X" → "has its X". From Pair 02.
const LITOTES_COLLAPSE: Rule = {
  name: "litotesCollapse",
  enabledKey: "collapseLitotes",
  pattern: /\bis\s+not\s+without\s+its\s+/g,
  replacement: "has its ",
};

// "In today's [adj] [noun-of-context], [SUBJ] has emerged as one of the
// most [adj] [noun]" — split into two clauses, hard regex. Skip the
// hard version. Easier sibling: "In today's X world/landscape/era, [Y]
// is [Z]" pattern is already untouched by the lexical dict and works
// fine; the *risk* is the "has emerged as" version. Our dict already
// handles "has emerged as → is" so we don't need a structural rule
// here. This rule is therefore minimal — just normalize
// "In today's [evolving|fast-paced|modern|rapidly evolving] digital
// landscape," at sentence start when the rest of the sentence is long
// (>15 words) by moving the opener to the end. We approximate
// "long sentence" by requiring at least one comma later in the same
// sentence.
const IN_TODAYS_REFRAME: Rule = {
  name: "inTodaysReframe",
  enabledKey: "reframeInTodaysOpener",
  // Only match when the rest of the clause is substantial — i.e. there's
  // another comma before the sentence terminator. This keeps us from
  // mangling short sentences.
  pattern: /^In\s+today's\s+([a-z][\w-]*(?:\s+[a-z][\w-]*){0,3})\s+(world|landscape|era|age|environment|economy|market),\s+([^.!?]{20,}?)(?=[.!?])/gm,
  replacement: (_m: string, ...args: unknown[]) => {
    const modifier = args[0] as string;
    const noun = args[1] as string;
    const rest = args[2] as string;
    const restTrimmed = rest.trim();
    const lowered = restTrimmed.charAt(0).toLowerCase() + restTrimmed.slice(1);
    return `${lowered} in today's ${modifier} ${noun}`;
  },
};

const RULES: ReadonlyArray<Rule> = [
  // Order: idioms-shape transforms before clause-shape transforms.
  FIGURE_REFRAME,
  IN_TODAYS_REFRAME,
  IT_IS_ESSENTIAL_DROP,
  IT_IS_CRUCIAL_DROP,
  LITOTES_COLLAPSE,
  WHILE_TO_AND,
];

const DEFAULT_OPTS: Required<StructuralOptions> = {
  joinWhileToAnd: true,
  reframeFigureOpener: true,
  dropItIsCrucialThat: true,
  dropItIsEssentialThat: true,
  collapseLitotes: true,
  reframeInTodaysOpener: true,
};

function applyRule(text: string, rule: Rule): { text: string; count: number } {
  let count = 0;
  const out = text.replace(rule.pattern, (match: string, ...args: unknown[]) => {
    count += 1;
    if (typeof rule.replacement === "function") {
      return rule.replacement(match, ...args);
    }
    // Resolve $N
    const captures = args.filter((a) => typeof a === "string");
    return rule.replacement.replace(/\$(\d+)/g, (_full, n: string) => {
      const cap = captures[Number(n) - 1];
      return typeof cap === "string" ? cap : "";
    });
  });
  return { text: out, count };
}

export function injectStructural(
  text: string,
  opts: StructuralOptions = {}
): string {
  const merged = { ...DEFAULT_OPTS, ...opts };
  let output = text;
  for (const rule of RULES) {
    if (!merged[rule.enabledKey]) continue;
    output = applyRule(output, rule).text;
  }
  // Cleanup: collapse double spaces, fix space-before-punct, recapitalize
  // sentence starts (some rules drop leading phrases).
  output = output.replace(/ {2,}/g, " ").replace(/\s+([,.;:])/g, "$1");
  output = output.replace(/(^|[.!?]\s+)([a-z])/g, (_m, p: string, c: string) => p + c.toUpperCase());
  return output;
}

export function countStructural(text: string): StructuralCounts {
  const counts: StructuralCounts = {
    whileToAnd: 0,
    figureReframe: 0,
    itIsCrucialDrop: 0,
    itIsEssentialDrop: 0,
    litotesCollapse: 0,
    inTodaysReframe: 0,
    total: 0,
  };
  for (const rule of RULES) {
    const c = applyRule(text, rule).count;
    counts[rule.name] = c;
    counts.total += c;
  }
  return counts;
}
