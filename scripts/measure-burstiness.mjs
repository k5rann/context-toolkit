#!/usr/bin/env node

import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);
const { createJiti } = require("jiti");

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const DEFAULT_INPUT_DIR = path.join(
  ROOT,
  "research/humanizer-model-swap-runs/2026-05-13T12-33-12-831Z"
);

const jiti = createJiti(ROOT, {
  alias: {
    "@": ROOT,
  },
});

const {
  injectBurstiness,
  measureBurstiness,
} = jiti(path.join(ROOT, "lib/humanizer-burstiness.ts"));

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

function fmt(value) {
  return Number.isFinite(value) ? value.toFixed(3) : "0.000";
}

function pad(value, width) {
  return String(value).padEnd(width, " ");
}

async function listTextFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".txt"))
    .map((entry) => path.join(dir, entry.name))
    .sort();
}

async function main() {
  const inputDir = path.resolve(argValue("--dir", DEFAULT_INPUT_DIR));
  const targetCV = Number(argValue("--target-cv", "0.65"));
  const maxAggression = Number(argValue("--max-aggression", "0.7"));
  const files = await listTextFiles(inputDir);

  if (files.length === 0) {
    throw new Error(`No .txt files found in ${inputDir}`);
  }

  const rows = [];

  for (const file of files) {
    const text = await fs.readFile(file, "utf8");
    const transformed = injectBurstiness(text, { targetCV, maxAggression });
    const before = measureBurstiness(text);
    const after = measureBurstiness(transformed);

    rows.push({
      file: path.basename(file),
      before,
      after,
      delta: after.cv - before.cv,
      sentenceDelta: after.count - before.count,
    });
  }

  console.log(`Input dir: ${inputDir}`);
  console.log(`Options: targetCV=${targetCV}, maxAggression=${maxAggression}`);
  console.log("");
  console.log(
    [
      pad("file", 44),
      pad("base_cv", 9),
      pad("post_cv", 9),
      pad("delta", 9),
      pad("base_n", 8),
      pad("post_n", 8),
      "histogram_post [<5,5-10,10-15,15-25,25-40,40+]",
    ].join(" ")
  );
  console.log("-".repeat(118));

  for (const row of rows) {
    console.log(
      [
        pad(row.file, 44),
        pad(fmt(row.before.cv), 9),
        pad(fmt(row.after.cv), 9),
        pad(fmt(row.delta), 9),
        pad(row.before.count, 8),
        pad(row.after.count, 8),
        `[${row.after.histogram.join(", ")}]`,
      ].join(" ")
    );
  }

  const raised = rows.filter((row) => row.delta > 0).length;
  const meanDelta =
    rows.reduce((sum, row) => sum + row.delta, 0) / Math.max(1, rows.length);
  const meanBefore =
    rows.reduce((sum, row) => sum + row.before.cv, 0) / Math.max(1, rows.length);
  const meanAfter =
    rows.reduce((sum, row) => sum + row.after.cv, 0) / Math.max(1, rows.length);

  console.log("");
  console.log(`Raised CV: ${raised}/${rows.length}`);
  console.log(`Mean CV: ${fmt(meanBefore)} -> ${fmt(meanAfter)} (${fmt(meanDelta)})`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
