#!/usr/bin/env node
/**
 * AI detector verify command for autoresearch loop.
 *
 * For a given preset, humanizes every corpus sample, scores each output
 * with an AI detector, and prints the MEAN AI% to stdout (so the
 * autoresearch loop can capture it as the metric).
 *
 * Per-sample progress goes to stderr to keep stdout clean.
 *
 * Goal of the loop: drive this number DOWN (lower = more human-like).
 *
 * Supported detectors (--detector flag):
 *   sapling   — Sapling AI detector (https://api.sapling.ai). Needs paid plan
 *               as of 2026-05; free tier on the detection endpoint not available.
 *   hf-openai — openai-community/roberta-base-openai-detector via HF Inference.
 *               Trained on GPT-2 era, weaker than Sapling but free. Best of
 *               the available HF AI-detectors as of probe on 2026-05-18.
 *   hf-simpleai — Hello-SimpleAI/chatgpt-detector-roberta via HF. Probe
 *                 showed it calls obvious AI text "Human" — DO NOT USE for
 *                 directional signal.
 *
 * Usage:
 *   node --env-file=.env.local scripts/sapling-verify.mjs --preset stealth-verbose
 *   node --env-file=.env.local scripts/sapling-verify.mjs --preset chain --detector hf-openai --save
 *   node --env-file=.env.local scripts/sapling-verify.mjs --preset stealth-verbose --limit 5
 *
 * Environment:
 *   GEMINI_API_KEY     — required (for stealth presets)
 *   OPENROUTER_API_KEY — required (for chain presets, MiniMax)
 *   SAPLING_API_KEY    — required ONLY if --detector sapling
 *   HUGGINGFACE_API_KEY — required ONLY if --detector hf-*
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
const HF_BASE = "https://router.huggingface.co/hf-inference/models";
const HF_MODELS = {
  "hf-openai": "openai-community/roberta-base-openai-detector",
  "hf-simpleai": "Hello-SimpleAI/chatgpt-detector-roberta",
};

// ── flag parsing ────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function flag(name, fallback) {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
}
const PRESET = flag("--preset", "stealth-verbose");
const DETECTOR = flag("--detector", "hf-openai");
const LIMIT = Number(flag("--limit", "0")) || 0;
const SAVE = args.includes("--save");
const QUIET = args.includes("--quiet");

if (!["sapling", "hf-openai", "hf-simpleai"].includes(DETECTOR)) {
  console.error(
    `Unknown --detector ${DETECTOR}. Options: sapling, hf-openai, hf-simpleai`
  );
  process.exit(1);
}

// ── env validation ──────────────────────────────────────────────────────
const SAPLING_KEY = process.env.SAPLING_API_KEY;
// Use HUGGINGFACE_API_KEY (confirmed-working key) by default. Allow override
// via HF_DETECTOR_KEY only if explicitly opted in via HF_DETECTOR_KEY_PRIMARY=1.
// (The newer HF token created 2026-05-18 lacks Inference API permissions and
// returns 403; the older HUGGINGFACE_API_KEY has full access.)
const HF_KEY = process.env.HF_DETECTOR_KEY_PRIMARY === "1"
  ? (process.env.HF_DETECTOR_KEY || process.env.HUGGINGFACE_API_KEY)
  : (process.env.HUGGINGFACE_API_KEY || process.env.HF_DETECTOR_KEY);
const GEMINI_KEY = process.env.GEMINI_API_KEY;

if (DETECTOR === "sapling" && !SAPLING_KEY) {
  console.error(
    "SAPLING_API_KEY missing. Get one at sapling.ai and add to .env.local.\n" +
      "Note: Sapling requires a paid plan on the AI detection endpoint as of 2026-05.\n" +
      "Free alternative: --detector hf-openai (uses HF_DETECTOR_KEY or HUGGINGFACE_API_KEY)."
  );
  process.exit(1);
}
if (DETECTOR.startsWith("hf-") && !HF_KEY) {
  console.error("HF_DETECTOR_KEY (or HUGGINGFACE_API_KEY) missing for HF detector.");
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

// ── HuggingFace detector ────────────────────────────────────────────────
async function hfScore(text, modelId) {
  // HF inference can return:
  //   [[{label, score}, ...]] or [{label, score}, ...]
  //
  // openai-community labels: "Real" (human), "Fake" (AI)
  // hello-simpleai labels: "Human", "ChatGPT"
  //
  // We normalize by finding the AI-labeled score.
  const url = `${HF_BASE}/${modelId}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${HF_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ inputs: text }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`HF HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }
  const data = await res.json();
  // Flatten nested array
  const flat = Array.isArray(data?.[0]) ? data[0] : data;
  if (!Array.isArray(flat)) {
    throw new Error(`HF response unexpected shape: ${JSON.stringify(data).slice(0, 200)}`);
  }
  // Find AI-labeled entry (case-insensitive match on Fake/ChatGPT/AI/Generated)
  const aiEntry = flat.find((e) =>
    /^(fake|chatgpt|ai|generated|artificial)$/i.test(e.label)
  );
  if (!aiEntry) {
    throw new Error(`HF response missing AI-labeled entry: ${JSON.stringify(flat).slice(0, 200)}`);
  }
  return aiEntry.score * 100;
}

async function detectorScore(text) {
  if (DETECTOR === "sapling") return saplingScore(text);
  if (DETECTOR.startsWith("hf-")) return hfScore(text, HF_MODELS[DETECTOR]);
  throw new Error(`Unknown detector ${DETECTOR}`);
}

// ── main ────────────────────────────────────────────────────────────────
async function main() {
  const corpus = await loadCorpus();
  const samples = LIMIT > 0 ? corpus.slice(0, LIMIT) : corpus;
  if (!QUIET) {
    process.stderr.write(
      `[verify] preset=${PRESET} detector=${DETECTOR} samples=${samples.length}\n`
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
        aiPct = await detectorScore(output);
      } catch (e) {
        detectorErrors += 1;
        err = `${DETECTOR}: ${e.message || e}`;
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
      `\n[verify] no scored samples. humanize errors: ${humanizeErrors}, detector errors: ${detectorErrors}`
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
    const outPath = path.join(RUNS_DIR, `${ts}-${PRESET}-${DETECTOR}.json`);
    await fs.writeFile(
      outPath,
      JSON.stringify(
        {
          timestamp: ts,
          preset: PRESET,
          detector: DETECTOR,
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
        `[verify] wrote ${path.relative(ROOT, outPath)}\n`
      );
    }
  }

  if (!QUIET) {
    process.stderr.write(
      `[verify] mean=${mean.toFixed(2)}% scored=${scored.length}/${samples.length}\n`
    );
  }
}

main().catch((err) => {
  console.error(`[verify] fatal: ${err.message || err}`);
  process.exit(2);
});
