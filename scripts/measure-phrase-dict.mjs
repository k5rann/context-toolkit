#!/usr/bin/env node
// Run the phrase dict against research/phrase-chase/pair-*/input.txt and
// compare swap counts to the real stealthwriter output.

import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { createJiti } = require("jiti");

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const jiti = createJiti(ROOT, { alias: { "@": ROOT } });

const { injectPhraseDict, countSwaps } = jiti(
  path.join(ROOT, "lib/humanizer-phrase-dict.ts")
);

const pairsRoot = path.join(ROOT, "research", "phrase-chase");
const pairDirs = fs
  .readdirSync(pairsRoot, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name.startsWith("pair-"))
  .map((d) => d.name)
  .sort();

const rows = [];
for (const dir of pairDirs) {
  const inputPath = path.join(pairsRoot, dir, "input.txt");
  const outputPath = path.join(pairsRoot, dir, "output.txt");
  if (!fs.existsSync(inputPath) || !fs.existsSync(outputPath)) continue;

  const input = fs.readFileSync(inputPath, "utf8").trim();
  const stealth = fs.readFileSync(outputPath, "utf8").trim();
  if (!input || !stealth) continue;

  const dict = injectPhraseDict(input);
  const counts = countSwaps(input);

  rows.push({ pair: dir, input, stealth, dict, counts });
}

console.log("");
console.log("Phrase-dict swap report");
console.log("=======================");
for (const row of rows) {
  console.log("");
  console.log(`${row.pair}`);
  console.log(
    `  swaps: ${row.counts.total} total ` +
      `(idioms ${row.counts.idioms}, vocab ${row.counts.vocab}, ` +
      `transitions ${row.counts.transitions})`
  );
  console.log(
    `  chars: input=${row.input.length}  dict=${row.dict.length}  ` +
      `stealth=${row.stealth.length}`
  );
  console.log(`  dict preview: ${row.dict.slice(0, 200).replace(/\n/g, " ")}…`);
}

const totals = rows.reduce(
  (acc, r) => ({
    total: acc.total + r.counts.total,
    idioms: acc.idioms + r.counts.idioms,
    vocab: acc.vocab + r.counts.vocab,
    transitions: acc.transitions + r.counts.transitions,
  }),
  { total: 0, idioms: 0, vocab: 0, transitions: 0 }
);

console.log("");
console.log("Totals across all pairs");
console.log(
  `  ${totals.total} swaps  (idioms ${totals.idioms}, vocab ${totals.vocab}, transitions ${totals.transitions})`
);
console.log("");
