#!/usr/bin/env node
/**
 * StealthWriter similarity verify — autoresearch loop metric.
 *
 * Since neither Sapling (paid) nor HF detectors (anti-correlated with
 * Copyleaks) can serve as a real metric, this script computes a
 * stylometric DISTANCE between the preset's outputs and the 6
 * known-Copyleaks-clean StealthWriter outputs in research/phrase-chase/.
 *
 * The hypothesis: outputs that look stylometrically like SW outputs
 * should evade Copyleaks similarly (since style fingerprint is the
 * signal Copyleaks reads, and SW's style fingerprint demonstrably
 * fools Copyleaks).
 *
 * Lower distance = more like SW = better for the loop.
 *
 * Components (each normalized to 0-1 space, weighted, summed as L1):
 *   1. Burstiness CV deviation        (weight 25)
 *   2. MATTR deviation                (weight 20)
 *   3. Mean sentence length deviation (weight 15)
 *   4. Function word density deviation (weight 20, top-10 function words)
 *   5. Length ratio deviation         (weight 10)
 *   6. Trigger word density           (weight 10, lower is better)
 *
 * Maximum possible distance: 100 (all components fully misaligned).
 * Target distance: < 25 (close to SW fingerprint).
 *
 * Usage:
 *   node --env-file=.env.local scripts/sw-similarity-verify.mjs --preset stealth-verbose-v2
 *   node --env-file=.env.local scripts/sw-similarity-verify.mjs --preset chain --save
 *   node --env-file=.env.local scripts/sw-similarity-verify.mjs --preset chain --limit 5
 *
 * Output to stdout: mean distance across corpus. Lower = better.
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

// ── flags ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function flag(name, fallback) {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
}
const PRESET = flag("--preset", "stealth-verbose-v2");
const LIMIT = Number(flag("--limit", "0")) || 0;
const SAVE = args.includes("--save");
const QUIET = args.includes("--quiet");
const VERBOSE = args.includes("--verbose-metrics");

const GEMINI_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_KEY) {
  console.error("GEMINI_API_KEY missing.");
  process.exit(1);
}

// ── stylometric helpers ─────────────────────────────────────────────────
const FUNCTION_WORDS = [
  "the",
  "and",
  "of",
  "to",
  "in",
  "a",
  "is",
  "that",
  "for",
  "it",
];
const TRIGGER_WORDS = [
  "delve",
  "tapestry",
  "furthermore",
  "moreover",
  "comprehensive",
  "leverage",
  "streamline",
  "robust",
  "ultimately",
  "navigate",
  "landscape",
  "realm",
  "myriad",
  "intricate",
  "multifaceted",
  "paradigm",
  "synergy",
  "seamless",
  "pivotal",
  "transformative",
];

function tokenize(text) {
  return (text.toLowerCase().match(/[a-z']+/g) || []);
}

function splitSentences(text) {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z"'(])/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

function meanStd(arr) {
  if (!arr.length) return { mean: 0, std: 0, cv: 0 };
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const variance =
    arr.reduce((acc, v) => acc + (v - mean) ** 2, 0) / arr.length;
  const std = Math.sqrt(variance);
  return { mean, std, cv: mean > 0 ? std / mean : 0 };
}

function mattr(tokens, window = 50) {
  if (tokens.length < window) {
    return tokens.length ? new Set(tokens).size / tokens.length : 0;
  }
  let sum = 0;
  let count = 0;
  for (let i = 0; i <= tokens.length - window; i++) {
    sum += new Set(tokens.slice(i, i + window)).size / window;
    count += 1;
  }
  return count ? sum / count : 0;
}

function functionWordFreq(tokens) {
  if (!tokens.length) return {};
  const total = tokens.length;
  const counts = {};
  for (const w of FUNCTION_WORDS) counts[w] = 0;
  for (const t of tokens) {
    if (Object.prototype.hasOwnProperty.call(counts, t)) counts[t] += 1;
  }
  const freq = {};
  for (const w of FUNCTION_WORDS) freq[w] = counts[w] / total;
  return freq;
}

function triggerDensity(tokens) {
  if (!tokens.length) return 0;
  let hits = 0;
  for (const t of tokens) {
    if (TRIGGER_WORDS.includes(t)) hits += 1;
  }
  return (hits / tokens.length) * 1000; // hits per 1000 tokens
}

function fingerprint(text, inputText) {
  const tokens = tokenize(text);
  const sentences = splitSentences(text);
  const sentenceLengths = sentences.map((s) => tokenize(s).length);
  const { cv, mean: meanSenLen } = meanStd(sentenceLengths);
  return {
    burstinessCV: cv,
    mattr: mattr(tokens),
    meanSenLen,
    fnFreq: functionWordFreq(tokens),
    lengthRatio:
      inputText && tokenize(inputText).length
        ? tokens.length / tokenize(inputText).length
        : 1,
    triggerDensity: triggerDensity(tokens),
  };
}

// ── SW reference fingerprint (precomputed in main) ──────────────────────
async function loadSWReference() {
  // Average fingerprint across 6 known-Copyleaks-clean SW outputs.
  const pairsRoot = path.join(ROOT, "research/phrase-chase");
  const dirs = (
    await fs.readdir(pairsRoot, { withFileTypes: true })
  )
    .filter((d) => d.isDirectory() && d.name.startsWith("pair-"))
    .map((d) => d.name)
    .sort();
  const fps = [];
  for (const d of dirs) {
    const inp = path.join(pairsRoot, d, "input.txt");
    const out = path.join(pairsRoot, d, "output.txt");
    try {
      const input = (await fs.readFile(inp, "utf8")).trim();
      const output = (await fs.readFile(out, "utf8")).trim();
      if (input && output) fps.push(fingerprint(output, input));
    } catch {
      // skip
    }
  }
  if (!fps.length) throw new Error("no SW reference outputs loaded");
  // Average scalar fields
  const avg = {
    burstinessCV: 0,
    mattr: 0,
    meanSenLen: 0,
    lengthRatio: 0,
    triggerDensity: 0,
    fnFreq: Object.fromEntries(FUNCTION_WORDS.map((w) => [w, 0])),
  };
  for (const fp of fps) {
    avg.burstinessCV += fp.burstinessCV;
    avg.mattr += fp.mattr;
    avg.meanSenLen += fp.meanSenLen;
    avg.lengthRatio += fp.lengthRatio;
    avg.triggerDensity += fp.triggerDensity;
    for (const w of FUNCTION_WORDS) avg.fnFreq[w] += fp.fnFreq[w] || 0;
  }
  const n = fps.length;
  avg.burstinessCV /= n;
  avg.mattr /= n;
  avg.meanSenLen /= n;
  avg.lengthRatio /= n;
  avg.triggerDensity /= n;
  for (const w of FUNCTION_WORDS) avg.fnFreq[w] /= n;
  return { avg, samples: fps, count: n };
}

// ── distance from SW fingerprint ────────────────────────────────────────
// Each component: 0 (identical to SW) → high (very different).
// Total: sum of weighted components. Lower is better.
function distance(fp, swAvg) {
  const wBurst = 25;
  const wMattr = 20;
  const wSenLen = 15;
  const wFn = 20;
  const wLen = 10;
  const wTrig = 10;

  // Normalize each deviation to ~0-1 by dividing by a plausible max
  const dBurst = Math.min(1, Math.abs(fp.burstinessCV - swAvg.burstinessCV) / 0.4);
  const dMattr = Math.min(1, Math.abs(fp.mattr - swAvg.mattr) / 0.2);
  const dSenLen = Math.min(1, Math.abs(fp.meanSenLen - swAvg.meanSenLen) / 15);
  // Function-word freq distance: mean abs diff per word, scaled by 0.05 (5pp)
  const fnDevs = FUNCTION_WORDS.map((w) =>
    Math.min(1, Math.abs((fp.fnFreq[w] || 0) - (swAvg.fnFreq[w] || 0)) / 0.05)
  );
  const dFn = fnDevs.reduce((a, b) => a + b, 0) / fnDevs.length;
  const dLen = Math.min(1, Math.abs(fp.lengthRatio - swAvg.lengthRatio) / 1.0);
  // Trigger density: SW outputs DO contain some triggers; reward 0 hits
  // but also penalize way more than SW does.
  const dTrig = Math.min(
    1,
    Math.abs(fp.triggerDensity - swAvg.triggerDensity) / 15
  );

  const total =
    dBurst * wBurst +
    dMattr * wMattr +
    dSenLen * wSenLen +
    dFn * wFn +
    dLen * wLen +
    dTrig * wTrig;

  return {
    total,
    components: {
      burst: +(dBurst * wBurst).toFixed(2),
      mattr: +(dMattr * wMattr).toFixed(2),
      senLen: +(dSenLen * wSenLen).toFixed(2),
      fn: +(dFn * wFn).toFixed(2),
      len: +(dLen * wLen).toFixed(2),
      trig: +(dTrig * wTrig).toFixed(2),
    },
  };
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
      // skip
    }
  }
  return samples;
}

// ── main ────────────────────────────────────────────────────────────────
async function main() {
  const sw = await loadSWReference();
  if (!QUIET) {
    process.stderr.write(
      `[sw-sim] reference: ${sw.count} SW outputs averaged. SW fingerprint:\n` +
        `         burstCV=${sw.avg.burstinessCV.toFixed(3)} MATTR=${sw.avg.mattr.toFixed(3)} ` +
        `meanSenLen=${sw.avg.meanSenLen.toFixed(2)} lenRatio=${sw.avg.lengthRatio.toFixed(2)} ` +
        `trigDensity=${sw.avg.triggerDensity.toFixed(2)}\n`
    );
  }

  const corpus = await loadCorpus();
  const samples = LIMIT > 0 ? corpus.slice(0, LIMIT) : corpus;
  if (!QUIET) {
    process.stderr.write(
      `[sw-sim] preset=${PRESET} samples=${samples.length}\n`
    );
  }

  const perSample = [];
  let humanizeErrors = 0;

  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    const t0 = Date.now();
    let output = null;
    let dist = null;
    let err = null;
    let fp = null;

    try {
      const result = await humanize({
        text: sample.text,
        contentMode: "general",
        referenceStyle: "neutral",
        modelPreset: PRESET,
        apiKey: GEMINI_KEY,
      });
      output = result.output;
      fp = fingerprint(output, sample.text);
      dist = distance(fp, sw.avg);
    } catch (e) {
      humanizeErrors += 1;
      err = e.message || String(e);
    }

    const ms = Date.now() - t0;
    perSample.push({
      id: sample.id,
      source: sample.source,
      inputWords: (sample.text.match(/\S+/g) || []).length,
      outputWords: output ? (output.match(/\S+/g) || []).length : null,
      distance: dist === null ? null : +dist.total.toFixed(2),
      components: dist?.components,
      fp,
      ms,
      err,
    });

    if (!QUIET) {
      const d = dist === null ? "FAIL" : `${dist.total.toFixed(1)}`;
      const extra = VERBOSE && dist
        ? `  [burst=${dist.components.burst} mattr=${dist.components.mattr} senLen=${dist.components.senLen} fn=${dist.components.fn} len=${dist.components.len} trig=${dist.components.trig}]`
        : "";
      process.stderr.write(
        `  [${i + 1}/${samples.length}] ${sample.id.padEnd(40)} dist=${d.padStart(6)}  ${(ms / 1000).toFixed(1)}s${err ? `  err: ${err}` : ""}${extra}\n`
      );
    }
  }

  const scored = perSample.filter((r) => typeof r.distance === "number");
  if (!scored.length) {
    console.error(`\n[sw-sim] no scored samples. humanize errors: ${humanizeErrors}`);
    process.exit(2);
  }

  const mean = scored.reduce((acc, r) => acc + r.distance, 0) / scored.length;

  // primary metric: mean distance from SW fingerprint, lower=better
  process.stdout.write(`${mean.toFixed(2)}\n`);

  if (SAVE) {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    await fs.mkdir(RUNS_DIR, { recursive: true });
    const outPath = path.join(RUNS_DIR, `${ts}-${PRESET}-swsim.json`);
    await fs.writeFile(
      outPath,
      JSON.stringify(
        {
          timestamp: ts,
          preset: PRESET,
          metric: "sw-similarity-distance",
          swReference: { count: sw.count, avg: sw.avg },
          samplesScored: scored.length,
          samplesTotal: samples.length,
          meanDistance: +mean.toFixed(2),
          humanizeErrors,
          perSample,
        },
        null,
        2
      ),
      "utf8"
    );
    if (!QUIET) {
      process.stderr.write(`[sw-sim] wrote ${path.relative(ROOT, outPath)}\n`);
    }
  }

  if (!QUIET) {
    process.stderr.write(
      `[sw-sim] mean distance=${mean.toFixed(2)} (lower=better) scored=${scored.length}/${samples.length}\n`
    );
  }
}

main().catch((err) => {
  console.error(`[sw-sim] fatal: ${err.message || err}`);
  process.exit(2);
});
