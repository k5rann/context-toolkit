#!/usr/bin/env node
/**
 * Chain (production) vs Stealth (style-anchor) head-to-head.
 *
 * For each sample in the corpus:
 *   1. Humanize through preset=chain (current site default, 2-hop)
 *   2. Humanize through preset=stealth (Gemini Flash + style anchor)
 *   3. Score both outputs on objective lexical signals
 *   4. Save outputs + per-sample scorecard
 *
 * No detector is called (GPTZero public endpoint is 401-gated as of
 * 2026-05-18). Lexical metrics short-list winners for manual Copyleaks
 * confirmation.
 *
 * Usage:
 *   node --env-file=.env.local scripts/compare-chain-vs-stealth.mjs
 *   node --env-file=.env.local scripts/compare-chain-vs-stealth.mjs --limit 3
 *   node --env-file=.env.local scripts/compare-chain-vs-stealth.mjs --only chain
 *
 * Output: research/main-vs-stealth-runs/<timestamp>/
 *   chain/<sample>.txt
 *   stealth/<sample>.txt
 *   report.md
 *   raw.json
 */

import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);
const { createJiti } = require("jiti");

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const CORPUS_DIR = path.join(ROOT, "research/ai-test-corpus");
const PHRASE_CHASE_DIR = path.join(ROOT, "research/phrase-chase");
const RUNS_DIR = path.join(ROOT, "research/main-vs-stealth-runs");

const jiti = createJiti(ROOT, { alias: { "@": ROOT } });

const { humanize } = jiti(path.join(ROOT, "lib/humanizer.ts"));
const { countSwaps } = jiti(path.join(ROOT, "lib/humanizer-phrase-dict.ts"));
const { measureBurstiness } = jiti(
  path.join(ROOT, "lib/humanizer-burstiness.ts")
);

// ── flag parsing ────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function flag(name, fallback) {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
}
const LIMIT = Number(flag("--limit", "0")) || 0;
const ONLY = flag("--only", "");
const PRESETS = ONLY
  ? [ONLY]
  : ["chain", "stealth"];

const GEMINI_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_KEY) {
  console.error(
    "GEMINI_API_KEY missing. Run with: node --env-file=.env.local ..."
  );
  process.exit(1);
}
if (!process.env.OPENROUTER_API_KEY) {
  console.warn(
    "warn: OPENROUTER_API_KEY missing — chain preset (MiniMax hop2) will fail. Continuing anyway."
  );
}

// ── corpus loader ───────────────────────────────────────────────────────
async function loadCorpus() {
  const samples = [];

  // ai-test-corpus
  const corpusEntries = await fs.readdir(CORPUS_DIR);
  for (const fname of corpusEntries.sort()) {
    if (!fname.endsWith(".txt")) continue;
    const text = (await fs.readFile(path.join(CORPUS_DIR, fname), "utf8"))
      .trim();
    samples.push({
      id: `corpus-${fname.replace(/\.txt$/, "")}`,
      source: "ai-test-corpus",
      text,
    });
  }

  // phrase-chase pair-*/input.txt
  const pairEntries = await fs.readdir(PHRASE_CHASE_DIR, {
    withFileTypes: true,
  });
  for (const entry of pairEntries.sort((a, b) => a.name.localeCompare(b.name))) {
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

// ── scoring helpers ─────────────────────────────────────────────────────
const TRIGGER_PHRASES = [
  "delve",
  "tapestry",
  "furthermore",
  "moreover",
  "additionally",
  "in conclusion",
  "comprehensive",
  "leverage",
  "streamline",
  "robust",
  "ensure",
  "ultimately",
  "navigate",
  "landscape",
  "realm",
  "endeavor",
  "facilitate",
  "embark",
  "harness",
  "myriad",
  "plethora",
  "intricate",
  "nuanced",
  "multifaceted",
  "paradigm",
  "synergy",
  "holistic",
  "seamless",
  "pivotal",
  "crucial",
  "vital",
  "essential",
  "significant",
  "fundamental",
  "transformative",
];

function wordCount(s) {
  return (s.match(/\S+/g) || []).length;
}

function countTriggerHits(text) {
  const lower = text.toLowerCase();
  let total = 0;
  const hits = {};
  for (const phrase of TRIGGER_PHRASES) {
    const re = new RegExp(`\\b${phrase}\\b`, "gi");
    const matches = lower.match(re);
    if (matches) {
      total += matches.length;
      hits[phrase] = matches.length;
    }
  }
  return { total, hits };
}

function mattr(text, window = 50) {
  // Moving Average Type-Token Ratio — lexical diversity insensitive to length.
  const tokens = text.toLowerCase().match(/[a-z']+/g) || [];
  if (tokens.length < window) {
    const types = new Set(tokens).size;
    return tokens.length ? types / tokens.length : 0;
  }
  let sum = 0;
  let count = 0;
  for (let i = 0; i <= tokens.length - window; i++) {
    const slice = tokens.slice(i, i + window);
    sum += new Set(slice).size / window;
    count += 1;
  }
  return count ? sum / count : 0;
}

function scoreOutput(text, originalText) {
  const wc = wordCount(text);
  const origWc = wordCount(originalText);
  const lenRetention = origWc ? wc / origWc : 0;
  const triggers = countTriggerHits(text);
  const triggerDensity = wc ? (triggers.total / wc) * 1000 : 0; // hits per 1000 words
  const burst = measureBurstiness(text);
  const swaps = countSwaps(text); // remaining swappable phrases
  const lex = mattr(text);

  return {
    wordCount: wc,
    lenRetention: +lenRetention.toFixed(3),
    triggerHits: triggers.total,
    triggerDensity: +triggerDensity.toFixed(2),
    triggerTopHits: triggers.hits,
    burstinessCV: +(burst.cv ?? 0).toFixed(3),
    burstinessMean: +(burst.mean ?? 0).toFixed(2),
    remainingSwaps: swaps.total,
    mattr: +lex.toFixed(3),
  };
}

// ── main ────────────────────────────────────────────────────────────────
async function main() {
  const corpus = await loadCorpus();
  const samples = LIMIT > 0 ? corpus.slice(0, LIMIT) : corpus;

  console.log(
    `Loaded ${corpus.length} samples (using ${samples.length}). Presets: ${PRESETS.join(", ")}`
  );

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const runDir = path.join(RUNS_DIR, timestamp);
  await fs.mkdir(runDir, { recursive: true });
  for (const p of PRESETS) {
    await fs.mkdir(path.join(runDir, p), { recursive: true });
  }

  const results = [];
  let n = 0;
  for (const sample of samples) {
    n += 1;
    const row = {
      id: sample.id,
      source: sample.source,
      inputWordCount: wordCount(sample.text),
    };
    console.log(
      `\n[${n}/${samples.length}] ${sample.id} (${row.inputWordCount} words)`
    );

    for (const preset of PRESETS) {
      const startedAt = Date.now();
      try {
        const result = await humanize({
          text: sample.text,
          contentMode: "general",
          referenceStyle: "neutral",
          modelPreset: preset,
          apiKey: GEMINI_KEY,
        });
        const elapsed = Date.now() - startedAt;
        const score = scoreOutput(result.output, sample.text);
        row[preset] = {
          ms: elapsed,
          ok: true,
          quality: result.quality,
          ...score,
        };
        await fs.writeFile(
          path.join(runDir, preset, `${sample.id}.txt`),
          result.output,
          "utf8"
        );
        console.log(
          `  ${preset.padEnd(8)} ${(elapsed / 1000).toFixed(1)}s  wc=${score.wordCount}  trig=${score.triggerHits} (dens=${score.triggerDensity})  CV=${score.burstinessCV}  MATTR=${score.mattr}`
        );
      } catch (err) {
        row[preset] = { ok: false, error: String(err.message || err) };
        console.log(`  ${preset.padEnd(8)} FAIL: ${row[preset].error}`);
      }
    }
    results.push(row);
  }

  // ── report ───────────────────────────────────────────────────────────
  await fs.writeFile(
    path.join(runDir, "raw.json"),
    JSON.stringify(results, null, 2),
    "utf8"
  );

  const lines = [];
  lines.push(`# Chain vs Stealth — ${timestamp}`);
  lines.push("");
  lines.push(
    `Samples: ${samples.length} (ai-test-corpus + phrase-chase inputs). Detector: none (GPTZero gated). Metrics are proxy signals only.`
  );
  lines.push("");
  lines.push("## Per-sample scores");
  lines.push("");
  lines.push(
    "| Sample | Input wc | Chain wc | Chain trig | Chain CV | Chain MATTR | Stealth wc | Stealth trig | Stealth CV | Stealth MATTR |"
  );
  lines.push(
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|"
  );
  for (const r of results) {
    const c = r.chain?.ok ? r.chain : null;
    const s = r.stealth?.ok ? r.stealth : null;
    lines.push(
      `| ${r.id} | ${r.inputWordCount} | ${c?.wordCount ?? "ERR"} | ${c?.triggerHits ?? "—"} | ${c?.burstinessCV ?? "—"} | ${c?.mattr ?? "—"} | ${s?.wordCount ?? "ERR"} | ${s?.triggerHits ?? "—"} | ${s?.burstinessCV ?? "—"} | ${s?.mattr ?? "—"} |`
    );
  }

  // aggregates
  function agg(preset, key) {
    const vals = results
      .map((r) => r[preset]?.[key])
      .filter((v) => typeof v === "number");
    if (!vals.length) return null;
    const sum = vals.reduce((a, b) => a + b, 0);
    return +(sum / vals.length).toFixed(3);
  }

  lines.push("");
  lines.push("## Aggregate (mean across samples)");
  lines.push("");
  lines.push("| Metric | Chain | Stealth | Winner |");
  lines.push("|---|---:|---:|---|");
  const metrics = [
    ["Word count", "wordCount", "higher"],
    ["Length retention", "lenRetention", "closer-to-1"],
    ["Trigger hits", "triggerHits", "lower"],
    ["Trigger density /1000w", "triggerDensity", "lower"],
    ["Burstiness CV", "burstinessCV", "higher"],
    ["MATTR", "mattr", "higher"],
    ["Remaining swaps", "remainingSwaps", "lower"],
    ["Latency ms", "ms", "lower"],
  ];
  for (const [label, key, betterDir] of metrics) {
    const c = agg("chain", key);
    const s = agg("stealth", key);
    let winner = "—";
    if (c !== null && s !== null) {
      if (betterDir === "lower") winner = c < s ? "chain" : s < c ? "stealth" : "tie";
      else if (betterDir === "higher")
        winner = c > s ? "chain" : s > c ? "stealth" : "tie";
      else if (betterDir === "closer-to-1") {
        const dc = Math.abs(c - 1);
        const ds = Math.abs(s - 1);
        winner = dc < ds ? "chain" : ds < dc ? "stealth" : "tie";
      }
    }
    lines.push(`| ${label} | ${c ?? "—"} | ${s ?? "—"} | **${winner}** |`);
  }

  // copyleaks picks: stealth outputs with lowest trigger density + highest CV
  lines.push("");
  lines.push("## Suggested Copyleaks picks");
  lines.push("");
  lines.push(
    "Paste the texts below into copyleaks.com for ground-truth AI%. These are the stealth outputs that scored best on proxy metrics:"
  );
  lines.push("");
  const stealthOk = results.filter((r) => r.stealth?.ok);
  const ranked = stealthOk
    .map((r) => ({
      id: r.id,
      score: r.stealth.burstinessCV - r.stealth.triggerDensity / 50, // higher = better
      file: `stealth/${r.id}.txt`,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  for (const pick of ranked) {
    lines.push(`- \`${pick.file}\` (composite score ${pick.score.toFixed(3)})`);
  }
  lines.push("");
  lines.push("Also include 1 chain output for the same sample as a direct A/B:");
  if (ranked[0]) lines.push(`- \`chain/${ranked[0].id}.txt\``);

  await fs.writeFile(path.join(runDir, "report.md"), lines.join("\n"), "utf8");
  console.log(`\n✓ wrote ${path.relative(ROOT, runDir)}/report.md`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
