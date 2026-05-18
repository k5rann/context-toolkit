#!/usr/bin/env node
// Integration test: structural + dict + burstiness stacked.
// Ensures the modules compose without corrupting output and produce
// expected transforms in combination.

import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { createJiti } = require("jiti");
const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const jiti = createJiti(ROOT, { alias: { "@": ROOT } });

const { injectPhraseDict } = jiti(path.join(ROOT, "lib/humanizer-phrase-dict.ts"));
const { injectStructural } = jiti(path.join(ROOT, "lib/humanizer-structural.ts"));
const { injectBurstiness } = jiti(path.join(ROOT, "lib/humanizer-burstiness.ts"));

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

console.log("humanizer stack tests");

// Pair 01 input through structural — should produce both Figure reframe
// and while → and like the gold stealthwriter output.
{
  const input =
    "Figure 1 shows how ADAPT would operate in a real financial institution. The Isolation Forest layer identifies unusual behavior at the individual customer level, while the graph-based layer detects suspicious relationships between accounts and transactions.";
  const out = injectStructural(input);
  assert(
    "Pair 01: Figure reframe applies",
    out.startsWith("As seen in Figure 1, ADAPT"),
    out
  );
  assert(
    "Pair 01: while → and applies",
    /,\s+and\s+the\s+graph-based\s+layer/.test(out),
    out
  );
}

// Stacked: structural then dict — banned words from structural shouldn't
// leak through dict. E.g. "It is crucial that" → "It's essential that"
// then dict's `essential → important` produces "It's important that".
{
  const input = "It is crucial that we adapt.";
  const stacked = injectPhraseDict(injectStructural(input));
  assert(
    "stacked: 'It is crucial that' chains through dict",
    /^It's\s+important\s+that\b/.test(stacked),
    stacked
  );
}

// Pair 02 full input through structural + dict — verify litotes collapse
{
  const input =
    "However, this technological revolution is not without its challenges. Furthermore, additional points apply.";
  const stacked = injectPhraseDict(injectStructural(input));
  assert("litotes collapsed", /\bhas\s+its\s+challenges\b/.test(stacked), stacked);
  assert("Furthermore → Also", /\bAlso,/.test(stacked), stacked);
  assert("However → But", /\bBut\b/.test(stacked), stacked);
}

// No banned-word destinations even after full stack
{
  const input =
    "Furthermore, sophisticated and robust tools enhance comprehensive workflows. Therefore, we leverage cutting-edge multifaceted solutions to foster growth.";
  const stacked = injectBurstiness(injectPhraseDict(injectStructural(input)));
  const banned = [
    /\bMoreover\b/i,
    /\bcomprehensive\b/i,
    /\brobust\b/i,
    /\bleverage\b/i,
    /\bcutting-edge\b/i,
    /\bmultifaceted\b/i,
    /\bfoster\b/i,
    /\benhance\b/i,
  ];
  for (const re of banned) {
    assert(
      `full stack avoids banned word ${re.source}`,
      !re.test(stacked),
      stacked
    );
  }
}

// Article agreement survives the full stack
{
  const input = "We offer a comprehensive solution and a robust framework.";
  const stacked = injectPhraseDict(injectStructural(input));
  assert(
    "stacked: 'a comprehensive' → 'an overall'",
    /\ban\s+overall\s+solution\b/i.test(stacked),
    stacked
  );
  assert("stacked: 'a robust' → 'a strong'", /\ba\s+strong\s+framework\b/i.test(stacked), stacked);
}

// Idempotence: running the stack twice produces the same output as once
{
  const input =
    "In today's rapidly evolving digital landscape, artificial intelligence has emerged as one of the most transformative technologies. Furthermore, robust frameworks are essential.";
  const once = injectPhraseDict(injectStructural(input));
  const twice = injectPhraseDict(injectStructural(once));
  assert("stack is idempotent (no further changes on rerun)", once === twice, `once: ${once}\ntwice: ${twice}`);
}

console.log("");
if (failures > 0) {
  console.error(`${failures} failure(s)`);
  process.exit(1);
} else {
  console.log("all passed");
}
