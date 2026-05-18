#!/usr/bin/env node
/**
 * Sapling AI detector verify command for autoresearch loop.
 *
 * For a given preset, humanizes every corpus sample, scores each output
 * with Sapling's AI detector, and prints the MEAN AI% to stdout (so the
 * autoresearch loop can capture it as the metric).
 *
 * Per-sample progress goes to stderr to keep stdout clean.
 *
 * Goal of the loop: drive this number DOWN (lower = more human-like).
 *
 * Usage:
 *   node --env-file=.env.local scripts/sapling-verify.mjs --preset stealth-verbose
 *   node --env-file=.env.local scripts/sapling-verify.mjs --preset chain --save
 *   node --env-file=.env.local scripts/sapling-verify.mjs --preset stealth-verbose --limit 5
 *
 * Environment:
 *   SAPLING_API_KEY  — required (free tier at sapling.ai)
 *   GEMINI_API_KEY   — required (for stealth presets)
 *   OPENROUTER_API_KEY — required (for chain presets, MiniMax)
 *
 * Exit codes:
 *   0 — ran cleanly, AI% printed to stdout
 *   1 — config/env error
 *   2 — API or runtime error
 */

import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createJiti } = require("jiti");

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const CORPUS_DIR = path.join(ROOT, "research/ai-test-corpus");
const PHRASE_CHASE_DIR = path.join(ROOT, "research/phrase-chase");
const RUNS_DIR = path.join(ROOT, "research/autoresearch-runs");

const jiti = createJiti(ROOT, { alias: { "@": ROOT } });
const { humanize } = jiti(path.join(ROOT, "lib/humanizer.ts"));

const SAPLING_URL = "https://api.sapling.ai/api/v1/aidetect";

// ── flag parsing ────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function flag(name, fallback) {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
}
const PRESET = flag("--preset", "stealth-verbose");
const LIMIT = Number(flag("--limit", "0")) || 0;
const SAVE = args.includes("--save");
const QUIET = args.includes("--quiet");

// ── env validation ──────────────────────────────────────────────────────
const SAPLING_KEY = process.env.SAPLING_API_KEY;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
if (!SAPLING_KEY) {
  console.error(
    "SAPLING_API_KEY missing. Get one at sapling.ai and add to .env.local.\n" +
      "Then run: node --env-file=.env.local scripts/sapling-verify.mjs --preset <name>"
  );
  process.exit(1);
}
if (!GEMINI_KEY) {
  console.error("GEMINI_API_KEY missing. Stealth presets need it.");
  process.exit(1);
}

// ── corpus loader ───────────────────────────────────────────────────────
async function loadCorpus() {
  const samples = [];

  const corpusEntries = await fs.readdir(CORPUS_DIR);
  for (const fname of corpusEntries.sort()) {
    if (!fname.endsWith(".txt")) continue;
    const text = (
      await fs.readFile(path.join(CORPUS_DIR, fname), "utf8")
    ).trim();
    samples.push({
      id: `corpus-${fname.replace(/\.txt$/, "")}`,
      source: "ai-test-corpus",
      text,
    });
  }

  const pairEntries = await fs.readdir(PHRASE_CHASE_DIR, {
    withFileTypes: true,
  });
  for (const entry of pairEntries.sort((a, b) =>
    a.name.localeCompare(b.name)
  )) {
    if (!entry.isDirectory() || !entry.name.startsWith("pair-")) continue;
    const inputPath = path.join(PHRASE_CHASE_DIR, entry.name, "input.txt");
    try {
      const text = (await fs.readFile(inputPath, "utf8")).trim();
      if (text) {
        samples.push({
          id: `phrase-${entry.name}`,
          source: "phrase-chase",
          text,
        });
      }
    } catch {
      // skip missing
    }
  }

  return samples;
}

// ── Sapling detector ────────────────────────────────────────────────────
async function saplingScore(text) {
  const res = await fetch(SAPLING_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: SAPLING_KEY, text }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Sapling HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }
  const data = await res.json();
  if (typeof data.score !== "number") {
    throw new Error(`Sapling response missing score: ${JSON.stringify(data).slice(0, 200)}`);
  }
  // Sapling returns 0-1 (1 = AI). Convert to 0-100 %.
  return data.score * 100;
}

// ── main ────────────────────────────────────────────────────────────────
async function main() {
  const corpus = await loadCorpus();
  const samples = LIMIT > 0 ? corpus.slice(0, LIMIT) : corpus;
  if (!QUIET) {
    process.stderr.write(
      `[sapling-verify] preset=${PRESET} samples=${samples.length}\n`
    );
  }

  const perSample = [];
  let humanizeErrors = 0;
  let detectorErrors = 0;

  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    const t0 = Date.now();
    let output = null;
    let aiPct = null;
    let err = null;

    try {
      const result = await humanize({
        text: sample.text,
        contentMode: "general",
        referenceStyle: "neutral",
        modelPreset: PRESET,
        apiKey: GEMINI_KEY,
      });
      output = result.output;
    } catch (e) {
      humanizeErrors += 1;
      err = `humanize: ${e.message || e}`;
    }

    if (output) {
      try {
        aiPct = await saplingScore(output);
      } catch (e) {
        detectorErrors += 1;
        err = `sapling: ${e.message || e}`;
      }
    }

    const ms = Date.now() - t0;
    perSample.push({
      id: sample.id,
      source: sample.source,
      inputWords: (sample.text.match(/\S+/g) || []).length,
      outputWords: output ? (output.match(/\S+/g) || []).length : null,
      aiPct: aiPct === null ? null : +aiPct.toFixed(2),
      ms,
      err,
    });

    if (!QUIET) {
      const dot = aiPct === null ? "FAIL" : `${aiPct.toFixed(1)}%`;
      process.stderr.write(
        `  [${i + 1}/${samples.length}] ${sample.id.padEnd(40)} ${dot.padStart(7)}  ${(ms / 1000).toFixed(1)}s${err ? `  err: ${err}` : ""}\n`
      );
    }
  }

  const scored = perSample.filter((r) => typeof r.aiPct === "number");
  if (scored.length === 0) {
    console.error(
      `\n[sapling-verify] no scored samples. humanize errors: ${humanizeErrors}, detector errors: ${detectorErrors}`
    );
    process.exit(2);
  }
  const mean =
    scored.reduce((acc, r) => acc + r.aiPct, 0) / scored.length;

  // ── primary metric to stdout ──────────────────────────────────────────
  // autoresearch captures this number. Lower is better.
  process.stdout.write(`${mean.toFixed(2)}\n`);

  // ── full results to JSON if --save ────────────────────────────────────
  if (SAVE) {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    await fs.mkdir(RUNS_DIR, { recursive: true });
    const outPath = path.join(RUNS_DIR, `${ts}-${PRESET}.json`);
    await fs.writeFile(
      outPath,
      JSON.stringify(
        {
          timestamp: ts,
          preset: PRESET,
          samplesScored: scored.length,
          samplesTotal: samples.length,
          meanAiPct: +mean.toFixed(2),
          humanizeErrors,
          detectorErrors,
          perSample,
        },
        null,
        2
      ),
      "utf8"
    );
    if (!QUIET) {
      process.stderr.write(
        `[sapling-verify] wrote ${path.relative(ROOT, outPath)}\n`
      );
    }
  }

  if (!QUIET) {
    process.stderr.write(
      `[sapling-verify] mean=${mean.toFixed(2)}% scored=${scored.length}/${samples.length}\n`
    );
  }
}

main().catch((err) => {
  console.error(`[sapling-verify] fatal: ${err.message || err}`);
  process.exit(2);
});
