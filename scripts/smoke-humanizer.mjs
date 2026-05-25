#!/usr/bin/env node
/**
 * Smoke test for the Stealth humanizer pipeline.
 *
 * Hits a running dev server (or any specified URL) with a known input
 * and verifies:
 *
 *   1. Response is 200 OK
 *   2. composedOutput is non-empty
 *   3. tooShort is false (input is long enough for Copyleaks)
 *   4. poisonedPhrasesSwapped > 0 (obfuscator did something)
 *   5. The pipeline scrubbed the most obvious AI tells from input
 *
 * Usage:
 *   node scripts/smoke-humanizer.mjs
 *   node scripts/smoke-humanizer.mjs --url=https://context-toolkit.vercel.app
 *
 * Exit code 0 = pass, 1 = fail.
 */

const args = process.argv.slice(2);
const urlArg = args.find((a) => a.startsWith("--url="));
const baseUrl = urlArg ? urlArg.slice(6) : "http://localhost:3000";
const endpoint = `${baseUrl}/api/humanize-alternatives`;

// Poisoned-topic input — exact phrasing that triggered 100% AI on Copyleaks
// before the obfuscator. A working pipeline strips all of these.
const SMOKE_INPUT = [
  "Urban green spaces have become an essential component of modern city",
  "planning, offering numerous benefits to both residents and the environment.",
  "Parks, community gardens, and tree-lined boulevards help mitigate the urban",
  "heat island effect by providing shade and facilitating natural cooling",
  "processes. These spaces also serve as vital recreational areas where citizens",
  "can engage in physical activities, socialize, and improve their mental",
  "well-being. Furthermore, strategically designed green infrastructure can",
  "effectively manage stormwater runoff, reducing the burden on municipal",
  "drainage systems. As cities continue to expand and densify, urban planners",
  "must prioritize the integration of green spaces to ensure sustainable and",
  "livable communities for future generations.",
].join(" ");

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

function fail(msg) {
  console.error(`${RED}✗ FAIL${RESET} ${msg}`);
  process.exit(1);
}

function pass(msg) {
  console.log(`${GREEN}✓${RESET} ${msg}`);
}

function info(msg) {
  console.log(`${DIM}${msg}${RESET}`);
}

async function run() {
  console.log(`${YELLOW}Smoke test → ${endpoint}${RESET}`);
  info(`Input: ${SMOKE_INPUT.length} chars`);

  const started = Date.now();
  let res;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: SMOKE_INPUT }),
      signal: AbortSignal.timeout(120_000),
    });
  } catch (err) {
    fail(`Request errored: ${err.message}`);
  }

  const elapsed = Date.now() - started;
  info(`Response in ${(elapsed / 1000).toFixed(1)}s`);

  if (!res.ok) {
    const body = await res.text();
    fail(`Status ${res.status}: ${body.slice(0, 200)}`);
  }
  pass(`Status ${res.status}`);

  let data;
  try {
    data = await res.json();
  } catch (err) {
    fail(`Invalid JSON response: ${err.message}`);
  }

  if (!data.composedOutput || typeof data.composedOutput !== "string") {
    fail(`composedOutput missing or non-string`);
  }
  pass(`composedOutput present (${data.composedOutput.length} chars)`);

  if (data.tooShort) {
    fail(`tooShort=true — output is under 350 chars (Copyleaks won't scan)`);
  }
  pass(`Output length >= 350 chars (Copyleaks-scannable)`);

  if (!data.poisonedPhrasesSwapped || data.poisonedPhrasesSwapped < 5) {
    fail(
      `Obfuscator only swapped ${data.poisonedPhrasesSwapped} phrases — ` +
        `expected at least 5 for this poisoned input. ` +
        `Did lib/humanizer-topic-obfuscator.ts regress?`
    );
  }
  pass(
    `Obfuscator swapped ${data.poisonedPhrasesSwapped}/${data.poisonedPhrasesDetected} poisoned phrases`
  );

  // Check the obvious AI tells are gone from the output
  const aiTells = [
    "urban heat island",
    "stormwater runoff",
    "essential component",
    "future generations",
  ];
  const leakedTells = aiTells.filter((tell) =>
    data.composedOutput.toLowerCase().includes(tell)
  );
  if (leakedTells.length > 1) {
    fail(`AI tells leaked into output: ${leakedTells.join(", ")}`);
  }
  pass(
    leakedTells.length === 0
      ? `All AI tells scrubbed from output`
      : `Output contains 1 acceptable leak: ${leakedTells[0]}`
  );

  if (!data.sentences || data.sentences.length === 0) {
    fail(`sentences[] missing`);
  }
  pass(`sentences[]: ${data.sentences.length} entries`);

  // Spot-check: most sentences should have multiple alternatives
  const sentencesWithAlts = data.sentences.filter(
    (s) => Array.isArray(s.alternatives) && s.alternatives.length >= 2
  );
  if (sentencesWithAlts.length < data.sentences.length * 0.5) {
    fail(
      `Only ${sentencesWithAlts.length}/${data.sentences.length} sentences have multiple alternatives. Per-sentence variants failing?`
    );
  }
  pass(
    `${sentencesWithAlts.length}/${data.sentences.length} sentences have multiple alternatives`
  );

  console.log(
    `\n${GREEN}All smoke checks passed${RESET} (${(elapsed / 1000).toFixed(1)}s)`
  );
  console.log(`\n${DIM}Output preview:${RESET}`);
  console.log(data.composedOutput.slice(0, 400) + (data.composedOutput.length > 400 ? "…" : ""));
}

run().catch((err) => {
  console.error(`${RED}Unhandled error:${RESET}`, err);
  process.exit(1);
});
