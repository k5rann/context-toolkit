#!/usr/bin/env node
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { createJiti } = require("jiti");
const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const jiti = createJiti(ROOT, { alias: { "@": ROOT } });

const { injectStructural, countStructural } = jiti(
  path.join(ROOT, "lib/humanizer-structural.ts")
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

console.log("structural tests");

// Figure reframe
{
  const out = injectStructural("Figure 1 shows how ADAPT operates.");
  assert("Figure N reframe", out === "As seen in Figure 1, ADAPT operates.", out);
}

// While → and
{
  const out = injectStructural(
    "Layer A identifies anomalies, while the graph-based layer detects relationships."
  );
  assert(
    "', while' → ', and' between clauses",
    /,\s+and\s+the\s+graph-based/i.test(out),
    out
  );
}

// Doesn't kill "for a while" idiom
{
  const input = "We waited for a while before deciding.";
  const out = injectStructural(input);
  assert("doesn't break 'for a while'", out === input, out);
}

// It is crucial that → It's essential that
{
  const out = injectStructural(
    "It is crucial that stakeholders work together to build frameworks."
  );
  assert(
    "It is crucial that → It's essential that",
    /^It's\s+essential\s+that\b/.test(out),
    out
  );
}

// It is essential to recognize that → It's important to understand that
{
  const out = injectStructural(
    "It is essential to recognize that quality matters."
  );
  assert(
    "It is essential to recognize that → It's important to understand that",
    /^It's\s+important\s+to\s+understand\s+that\b/.test(out),
    out
  );
}

// Litotes collapse
{
  const out = injectStructural(
    "But this revolution is not without its challenges."
  );
  assert(
    "litotes: is not without its X → has its X",
    /\bhas\s+its\s+challenges\b/i.test(out),
    out
  );
}

// In today's opener reframe
{
  const out = injectStructural(
    "In today's rapidly evolving digital landscape, artificial intelligence is one of the most important technologies of the century."
  );
  assert(
    "moves 'In today's X landscape,' opener to end",
    /in today's rapidly evolving digital landscape\b/.test(out) &&
      !out.startsWith("In today's"),
    out
  );
}

// Short sentence: don't reframe (would degrade)
{
  const input = "In today's world, life is short.";
  const out = injectStructural(input);
  assert("leaves short 'In today's' sentences alone", out === input, out);
}

// Count
{
  const counts = countStructural(
    "Figure 1 shows how X works. It is crucial that we adapt, while the team builds trust."
  );
  assert(
    "counts figureReframe + itIsCrucialDrop + whileToAnd",
    counts.figureReframe === 1 &&
      counts.itIsCrucialDrop === 1 &&
      counts.whileToAnd === 1,
    JSON.stringify(counts)
  );
}

// No-op on plain text
{
  const input = "I went to the store today and bought some apples.";
  const out = injectStructural(input);
  assert("plain text unchanged", out === input, out);
}

console.log("");
if (failures > 0) {
  console.error(`${failures} failure(s)`);
  process.exit(1);
} else {
  console.log("all passed");
}
