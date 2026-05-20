/**
 * Topic-phrase obfuscator.
 *
 * Copyleaks' "AI Source Match" flags topics, not just writing patterns.
 * Common phrases in AI training data (e.g. "urban heat island effect",
 * "mental well-being", "stormwater runoff") trigger 100% AI detection
 * even on human-written text — because the detector recognizes the
 * n-gram as one it has seen in millions of AI outputs.
 *
 * This module runs BEFORE the LLM rewrite, replacing high-risk phrases
 * with casual paraphrases. The LLM then can't echo them back, and the
 * post-processor scrubs any that survive.
 *
 * Built from manual Copyleaks-flagged samples across:
 *   - urban planning / environment
 *   - AI / cybersecurity / tech
 *   - health / wellness
 *   - business / professional
 *   - academic / research
 */

interface PhraseSwap {
  pattern: RegExp;
  alternatives: string[];
}

// Topic-saturated phrases. Each entry has 3+ casual alternatives so the
// obfuscator can vary by seed and the same input doesn't always produce
// the same output.
const POISONED_PHRASES: PhraseSwap[] = [
  // ── URBAN / ENVIRONMENT ─────────────────────────────────────────
  { pattern: /\burban heat island( effect)?\b/gi, alternatives: ["the way concrete traps heat", "cities turning into ovens", "the heat trap thing cities have"] },
  { pattern: /\bgreen (?:spaces?|infrastructure)\b/gi, alternatives: ["parks and gardens", "green areas", "outdoor patches"] },
  { pattern: /\bstormwater runoff\b/gi, alternatives: ["rain runoff", "the water that pools up when it rains", "rainwater overflow"] },
  { pattern: /\bdrainage systems?\b/gi, alternatives: ["the pipes underground", "sewer lines", "what handles the rainwater"] },
  { pattern: /\bmental well-?being\b/gi, alternatives: ["how people feel day to day", "mood and mental state", "how you're doing in your head"] },
  { pattern: /\bcommunity gardens?\b/gi, alternatives: ["shared garden plots", "neighborhood gardens", "patch of land people grow stuff on"] },
  { pattern: /\btree-?lined (?:boulevards?|streets?)\b/gi, alternatives: ["streets with trees", "blocks with trees down the side", "roads where they planted trees"] },
  { pattern: /\b(?:natural )?cooling processes?\b/gi, alternatives: ["how things cool off naturally", "the air cooling down", "shade dropping the temperature"] },
  { pattern: /\bvital recreational areas?\b/gi, alternatives: ["places to hang out", "spots where you can do stuff", "areas for kicking around"] },
  { pattern: /\bphysical activit(?:y|ies)\b/gi, alternatives: ["working out", "moving around", "exercise"] },
  { pattern: /\bsustainable and livable\b/gi, alternatives: ["actually decent to live in", "not falling apart", "habitable"] },
  { pattern: /\b(?:future|coming) generations?\b/gi, alternatives: ["kids growing up later", "the people who'll be here in 30 years", "everyone who comes after"] },
  { pattern: /\bmunicipal (?:services?|drainage|infrastructure)\b/gi, alternatives: ["the city's stuff", "city-run systems", "what the council pays for"] },
  { pattern: /\binfrastructure upgrades?\b/gi, alternatives: ["fixing the old pipes and wires", "rebuilding what's there", "patching up the basics"] },

  // ── AI / TECH / CYBERSECURITY ───────────────────────────────────
  { pattern: /\bAI-? ?powered\b/gi, alternatives: ["run by AI", "with AI baked in", "using AI under the hood"] },
  { pattern: /\bartificial intelligence\b/gi, alternatives: ["machine smarts", "algorithms", "AI"] },
  { pattern: /\bmachine learning\b/gi, alternatives: ["training models on data", "pattern-finding code", "ML"] },
  { pattern: /\bdeep learning\b/gi, alternatives: ["neural net training", "the heavy-duty ML stuff", "big-network ML"] },
  { pattern: /\bnatural language processing\b/gi, alternatives: ["text processing", "language stuff", "parsing text"] },
  { pattern: /\bdata-?driven\b/gi, alternatives: ["based on what the numbers show", "informed by data", "driven by metrics"] },
  { pattern: /\bcyber( |-)?security( landscape| posture)?\b/gi, alternatives: ["security side of things", "the security setup", "what's protecting the systems"] },
  { pattern: /\bthreat landscape\b/gi, alternatives: ["what's coming at you out there", "the kinds of attacks happening", "all the bad actors floating around"] },
  { pattern: /\bcritical infrastructure\b/gi, alternatives: ["the systems we can't afford to lose", "stuff that has to stay up", "the important plumbing"] },
  { pattern: /\bphishing attacks?\b/gi, alternatives: ["fake emails trying to grab logins", "scam links", "those sketchy emails"] },
  { pattern: /\bransomware\b/gi, alternatives: ["the kind of malware that locks your files", "lockup malware", "the kind that holds your data hostage"] },
  { pattern: /\bmalicious actors?\b/gi, alternatives: ["people trying to break in", "bad actors", "attackers"] },
  { pattern: /\bdata breach(?:es)?\b/gi, alternatives: ["someone getting in and grabbing data", "leaks", "stolen records"] },
  { pattern: /\bsensitive (?:data|information)\b/gi, alternatives: ["stuff you don't want leaked", "private records", "the data that matters"] },
  { pattern: /\borganizational resilience\b/gi, alternatives: ["being able to take a hit and keep going", "bouncing back from problems", "staying functional under pressure"] },
  { pattern: /\bdigital (?:transformation|age|era)\b/gi, alternatives: ["everything going online", "the move to digital", "modern setup"] },

  // ── ENERGY / SUSTAINABILITY ─────────────────────────────────────
  { pattern: /\brenewable energy (?:sources?)?\b/gi, alternatives: ["clean power", "solar and wind", "non-fossil power"] },
  { pattern: /\b(?:solar|wind) power\b/gi, alternatives: ["sun and wind energy", "the renewables", "clean generation"] },
  { pattern: /\bbaseload power\b/gi, alternatives: ["the always-on electricity", "the steady grid load", "what keeps the lights on 24/7"] },
  { pattern: /\benergy storage (?:solutions?)?\b/gi, alternatives: ["batteries", "ways to store power", "places to park the extra juice"] },
  { pattern: /\bgrid (?:operators?|stability|management)\b/gi, alternatives: ["the people running the grid", "grid people", "whoever keeps the power on"] },
  { pattern: /\bintermittency (?:challenges|issues)?\b/gi, alternatives: ["the sun goes down and the wind stops thing", "renewables being on-again off-again", "the inconsistent supply"] },
  { pattern: /\bcarbon emissions?\b/gi, alternatives: ["CO2 going up", "smog and greenhouse gas", "the stuff warming the planet"] },
  { pattern: /\bclimate change\b/gi, alternatives: ["the planet getting hotter", "global warming", "the climate going sideways"] },

  // ── HEALTH / WELLNESS ───────────────────────────────────────────
  { pattern: /\boverall health and well-?being\b/gi, alternatives: ["how you're doing in general", "your whole health picture", "feeling good"] },
  { pattern: /\bnumerous health benefits\b/gi, alternatives: ["a bunch of upsides for your body", "good for you in lots of ways", "tons of health stuff"] },
  { pattern: /\bcardiovascular health\b/gi, alternatives: ["heart stuff", "how your ticker's doing", "circulation"] },

  // ── GENERIC AI HEDGES ──────────────────────────────────────────
  { pattern: /\bin (?:today'?s|the modern|the current) (?:world|age|era|society|landscape)\b/gi, alternatives: ["right now", "these days", "lately"] },
  { pattern: /\bplays? an? (?:crucial|vital|important|key|essential) (?:role|part)\b/gi, alternatives: ["matters a lot", "does a lot of work", "makes a real difference"] },
  { pattern: /\bin the realm of\b/gi, alternatives: ["in", "with", "around"] },
  { pattern: /\bin recent years?\b/gi, alternatives: ["lately", "the past few years", "in the last while"] },
  { pattern: /\bover the past (?:decade|few years)\b/gi, alternatives: ["the past ten years", "the last while", "since around 2015"] },
  { pattern: /\bas (?:cities|the world|society) continues? to (?:expand|grow|evolve)\b/gi, alternatives: ["as things keep growing", "as everything gets bigger", "as the world expands"] },
  { pattern: /\bfundamentally transformed\b/gi, alternatives: ["completely changed", "flipped", "turned upside down"] },
  { pattern: /\bsignificantly impacts?\b/gi, alternatives: ["really affects", "messes with", "changes a lot"] },
  { pattern: /\bcomprehensive (?:approach|strategy|solution)\b/gi, alternatives: ["full setup", "everything-at-once approach", "the whole thing"] },

  // ── BUSINESS / PROFESSIONAL ────────────────────────────────────
  { pattern: /\bcustomer (?:experience|engagement|satisfaction)\b/gi, alternatives: ["how customers feel", "user happiness", "what people think of using it"] },
  { pattern: /\bbusiness operations?\b/gi, alternatives: ["how the company runs", "day-to-day business stuff", "the operational side"] },
  { pattern: /\bcompetitive (?:advantage|edge)\b/gi, alternatives: ["a leg up on competitors", "an edge", "what makes you different"] },
  { pattern: /\bstrategic (?:initiatives?|priorities?)\b/gi, alternatives: ["big company plans", "the stuff leadership cares about", "main priorities"] },
  { pattern: /\bdrive (?:growth|innovation|change|results?)\b/gi, alternatives: ["push things forward", "make stuff happen", "move the needle"] },
];

// Capitalize first letter (preserves the rest)
function capFirst(s: string): string {
  return s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/**
 * Replace topic-saturated phrases with casual paraphrases. Uses seed-based
 * deterministic selection so the same input doesn't always produce the
 * same output (variety helps defeat detectors that cache fingerprints).
 *
 * Returns { output, swapCount } so callers can log how aggressive the
 * obfuscation was.
 */
export function obfuscateTopicPhrases(
  text: string,
  seed: number = Date.now() % 1000
): { output: string; swapCount: number } {
  let out = text;
  let swapCount = 0;
  let counter = 0;

  for (const { pattern, alternatives } of POISONED_PHRASES) {
    out = out.replace(pattern, (match) => {
      counter++;
      const idx = (seed + counter) % alternatives.length;
      const pick = alternatives[idx];
      // Preserve capitalization: if the original starts with uppercase
      // (sentence start), capitalize the replacement
      const isUpper = match.charAt(0) === match.charAt(0).toUpperCase() &&
                      match.charAt(0) !== match.charAt(0).toLowerCase();
      swapCount++;
      return isUpper ? capFirst(pick) : pick;
    });
  }

  return { output: out, swapCount };
}

/**
 * Count how many poisoned phrases are present without modifying the text.
 * Used for telemetry / UI warnings.
 */
export function countPoisonedPhrases(text: string): number {
  let count = 0;
  for (const { pattern } of POISONED_PHRASES) {
    const matches = text.match(pattern);
    if (matches) count += matches.length;
  }
  return count;
}
