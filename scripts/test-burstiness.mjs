#!/usr/bin/env node

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { createJiti } = require("jiti");

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const jiti = createJiti(ROOT, {
  alias: {
    "@": ROOT,
  },
});

const {
  injectBurstiness,
  measureBurstiness,
  sentenceLengths,
} = jiti(path.join(ROOT, "lib/humanizer-burstiness.ts"));

function rounded(value) {
  return Math.round(value * 1000) / 1000;
}

{
  const stats = measureBurstiness("A single sentence stays measurable.");
  assert.equal(stats.count, 1);
  assert.equal(stats.mean, 5);
  assert.equal(stats.std, 0);
  assert.equal(stats.cv, 0);
  assert.deepEqual(stats.histogram, [0, 1, 0, 0, 0, 0]);
}

{
  const lengths = sentenceLengths(
    "Dr. Smith met the U.S. team in D.C. They agreed quickly."
  );
  assert.deepEqual(lengths, [10, 3]);
}

{
  const stats = measureBurstiness(
    "Tiny. This sentence has exactly five words. This sentence has enough words to sit inside the middle bucket safely."
  );
  assert.deepEqual(stats.histogram, [1, 1, 1, 0, 0, 0]);
  assert.equal(rounded(stats.mean), 6.333);
}

{
  const input = [
    "Cybersecurity teams now review access patterns every week to find strange account behavior before problems spread.",
    "Training helps staff notice suspicious links and report them without waiting for a manager.",
    "Backups give the company another option when ransomware locks important files during a busy period.",
    "Clear ownership keeps security work from drifting between departments when pressure rises.",
  ].join(" ");
  const before = measureBurstiness(input);
  const output = injectBurstiness(input);
  const after = measureBurstiness(output);

  assert(after.cv > before.cv, `expected CV uplift, got ${before.cv} -> ${after.cv}`);
  const lowerOutput = output.toLowerCase();
  assert(lowerOutput.includes("cybersecurity teams now review"));
  assert(lowerOutput.includes("training helps staff notice"));
  assert(lowerOutput.includes("backups give the company"));
  assert(lowerOutput.includes("clear ownership keeps security"));
}

console.log("burstiness tests passed");
