#!/usr/bin/env node
// Pre-generate transformed outputs for every phrase-chase pair under
// 4 configurations: dict-only, structural-only, dict+structural,
// dict+structural+burstiness. Each result is saved to disk so the user
// can paste any of them into Copyleaks without re-running anything.

import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { createJiti } = require("jiti");
const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const jiti = createJiti(ROOT, { alias: { "@": ROOT } });

const { injectPhraseDict } = jiti(path.join(ROOT, "lib/humanizer-phrase-dict.ts"));
const { injectStructural } = jiti(path.join(ROOT, "lib/humanizer-structural.ts"));
const { injectBurstiness, measureBurstiness } = jiti(
  path.join(ROOT, "lib/humanizer-burstiness.ts")
);

const pairsRoot = path.join(ROOT, "research/phrase-chase");
const pairs = fs
  .readdirSync(pairsRoot, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name.startsWith("pair-"))
  .map((d) => d.name)
  .sort();

const CONFIGS = [
  {
    name: "dict-only",
    fn: (t) => injectPhraseDict(t),
  },
  {
    name: "structural-only",
    fn: (t) => injectStructural(t),
  },
  {
    name: "dict-plus-structural",
    fn: (t) => injectPhraseDict(injectStructural(t)),
  },
  {
    name: "all-three",
    fn: (t) => injectBurstiness(injectPhraseDict(injectStructural(t))),
  },
];

const summary = [];

for (const pair of pairs) {
  const inputPath = path.join(pairsRoot, pair, "input.txt");
  if (!fs.existsSync(inputPath)) continue;
  const input = fs.readFileSync(inputPath, "utf8").trim();
  if (!input) continue;

  const outDir = path.join(pairsRoot, pair, "transformed");
  fs.mkdirSync(outDir, { recursive: true });

  const row = { pair, inputCV: measureBurstiness(input).cv.toFixed(3) };

  for (const cfg of CONFIGS) {
    const transformed = cfg.fn(input);
    fs.writeFileSync(path.join(outDir, `${cfg.name}.txt`), transformed + "\n");
    const cv = measureBurstiness(transformed).cv;
    row[cfg.name] = {
      chars: transformed.length,
      cv: cv.toFixed(3),
    };
  }
  summary.push(row);
}

console.log("");
console.log("Generated transformed outputs");
console.log("=============================");
for (const row of summary) {
  console.log("");
  console.log(`${row.pair}  (input CV ${row.inputCV})`);
  for (const cfg of CONFIGS) {
    const r = row[cfg.name];
    console.log(`  ${cfg.name.padEnd(22)}  chars=${r.chars}  CV=${r.cv}`);
  }
}
console.log("");
console.log(
  `Files at research/phrase-chase/<pair>/transformed/{dict-only,structural-only,dict-plus-structural,all-three}.txt`
);
console.log("");
