#!/usr/bin/env node
// CLI harness: paste AI text in, get transformed text out. No dev
// server needed. Pick which transforms to apply via flags. Designed
// for fast Copyleaks validation.
//
// Usage:
//   echo "text..." | node scripts/humanize-cli.mjs
//   node scripts/humanize-cli.mjs < input.txt > output.txt
//   node scripts/humanize-cli.mjs --file input.txt
//   node scripts/humanize-cli.mjs --file input.txt --no-burstiness
//
// Flags:
//   --file <path>       read from file instead of stdin
//   --no-structural     disable structural transforms
//   --no-dict           disable phrase dict
//   --no-burstiness     disable burstiness (default: ON for CLI)
//   --only-dict         only apply dict
//   --only-structural   only apply structural
//   --only-burstiness   only apply burstiness
//   --report            print swap counts to stderr

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
const { injectStructural, countStructural } = jiti(
  path.join(ROOT, "lib/humanizer-structural.ts")
);
const { injectBurstiness, measureBurstiness } = jiti(
  path.join(ROOT, "lib/humanizer-burstiness.ts")
);

const argv = process.argv.slice(2);
function hasFlag(name) {
  return argv.includes(name);
}
function flagValue(name) {
  const i = argv.indexOf(name);
  return i === -1 ? null : argv[i + 1];
}

let useStructural = !hasFlag("--no-structural");
let useDict = !hasFlag("--no-dict");
let useBurstiness = !hasFlag("--no-burstiness");

if (hasFlag("--only-dict")) {
  useStructural = false;
  useBurstiness = false;
}
if (hasFlag("--only-structural")) {
  useDict = false;
  useBurstiness = false;
}
if (hasFlag("--only-burstiness")) {
  useStructural = false;
  useDict = false;
}

const report = hasFlag("--report");

async function readInput() {
  const file = flagValue("--file");
  if (file) {
    return fs.readFileSync(path.resolve(file), "utf8");
  }
  return await new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

const raw = await readInput();
const input = raw.trim();
if (!input) {
  console.error("humanize-cli: no input on stdin or --file");
  process.exit(2);
}

const stats = {
  inputChars: input.length,
  inputSentences: measureBurstiness(input).count,
  inputCV: measureBurstiness(input).cv,
};

let out = input;
const counts = {};

if (useStructural) {
  counts.structural = countStructural(out);
  out = injectStructural(out);
}
if (useDict) {
  counts.dict = countSwaps(out);
  out = injectPhraseDict(out);
}
if (useBurstiness) {
  out = injectBurstiness(out);
}

const post = measureBurstiness(out);
stats.outputChars = out.length;
stats.outputSentences = post.count;
stats.outputCV = post.cv;

process.stdout.write(out);
if (!out.endsWith("\n")) process.stdout.write("\n");

if (report) {
  console.error("");
  console.error("humanize-cli report");
  console.error("===================");
  console.error(
    `transforms: ${[
      useStructural && "structural",
      useDict && "dict",
      useBurstiness && "burstiness",
    ]
      .filter(Boolean)
      .join(" + ")}`
  );
  if (counts.structural)
    console.error(
      `structural swaps: ${counts.structural.total}  (figure ${counts.structural.figureReframe}, while→and ${counts.structural.whileToAnd}, it-is-crucial ${counts.structural.itIsCrucialDrop}, it-is-essential ${counts.structural.itIsEssentialDrop}, litotes ${counts.structural.litotesCollapse}, in-todays ${counts.structural.inTodaysReframe})`
    );
  if (counts.dict)
    console.error(
      `dict swaps: ${counts.dict.total}  (idioms ${counts.dict.idioms}, vocab ${counts.dict.vocab}, transitions ${counts.dict.transitions})`
    );
  console.error(
    `chars: in=${stats.inputChars}  out=${stats.outputChars}  Δ=${stats.outputChars - stats.inputChars}`
  );
  console.error(
    `sentences: in=${stats.inputSentences}  out=${stats.outputSentences}`
  );
  console.error(
    `burstiness CV: in=${stats.inputCV.toFixed(3)}  out=${stats.outputCV.toFixed(3)}`
  );
  console.error("");
}
