#!/usr/bin/env node
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { createJiti } = require("jiti");
const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const jiti = createJiti(ROOT, { alias: { "@": ROOT } });

const { injectPhraseDict, countSwaps } = jiti(
  path.join(ROOT, "lib/humanizer-phrase-dict.ts")
);

let failures = 0;
function assert(label, cond, details = "") {
  if (cond) {
    console.log(`  ok  ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label}`);
    if (details) console.log(`       ${details}`);
  }
}

console.log("phrase-dict tests");

// Idioms
{
  const out = injectPhraseDict(
    "In today's competitive landscape, we elevate their market presence."
  );
  assert(
    "swaps 'in today's competitive landscape' idiom",
    /in today's market/i.test(out),
    `got: ${out}`
  );
  assert(
    "swaps 'elevate their market presence' idiom",
    out.includes("take their market presence to the next level"),
    `got: ${out}`
  );
}

// Vocab
{
  const out = injectPhraseDict(
    "Sophisticated, robust, and comprehensive solutions enhance your workflow."
  );
  assert("swaps sophisticated → complex", /\bcomplex\b/i.test(out), out);
  assert("swaps robust → strong", /\bstrong\b/i.test(out), out);
  assert("swaps comprehensive → overall", /\boverall\b/i.test(out), out);
  assert("swaps enhance → improve", /\bimprove\b/i.test(out), out);
}

// Case preservation
{
  const out = injectPhraseDict("Sophisticated tools matter.");
  assert(
    "preserves sentence-start capitalization",
    out.startsWith("Complex"),
    out
  );
}

// Transitions
{
  const out = injectPhraseDict("Furthermore, the system works. However, errors occur.");
  assert("Furthermore → Also", out.startsWith("Also,"), out);
  assert("However → But mid-text", out.includes("But "), out);
  assert(
    "doesn't reintroduce banned 'Moreover'",
    !/\bMoreover\b/.test(out),
    out
  );
}

// Banned-target guard: result should not contain GENERIC_PATTERNS words
// that our dict deliberately avoids producing.
{
  const out = injectPhraseDict(
    "Furthermore, sophisticated and robust tools enhance comprehensive workflows."
  );
  const bannedTargets = ["Moreover", "moreover", "comprehensive", "robust", "leverage"];
  for (const w of bannedTargets) {
    assert(
      `doesn't produce banned word '${w}'`,
      !new RegExp(`\\b${w}\\b`, "i").test(out),
      out
    );
  }
}

// countSwaps
{
  const counts = countSwaps("Furthermore, sophisticated solutions enhance things.");
  assert(
    "counts at least one transition + vocab",
    counts.transitions >= 1 && counts.vocab >= 1,
    JSON.stringify(counts)
  );
}

// No-op on clean text
{
  const input = "I went to the store today and bought some apples.";
  const out = injectPhraseDict(input);
  assert("leaves plain text unchanged", out === input, `got: ${out}`);
}

// Article agreement after vowel-shift swap
{
  const out = injectPhraseDict("It is a comprehensive solution.");
  assert(
    "fixes 'a overall' → 'an overall' after vocab swap",
    /\ban overall\b/i.test(out),
    `got: ${out}`
  );
}

// Recapitalize after dropping leading phrase
{
  const out = injectPhraseDict("We argue. We believe that quality matters here.");
  assert(
    "recapitalizes sentence start after dropping 'we believe that'",
    /\bQuality matters here\.?\s*$/.test(out),
    `got: ${out}`
  );
}

console.log("");
if (failures > 0) {
  console.error(`${failures} failure(s)`);
  process.exit(1);
} else {
  console.log("all passed");
}
