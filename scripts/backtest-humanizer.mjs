#!/usr/bin/env node
/**
 * Local humanizer backtest.
 *
 * Reads .txt files from research/ai-test-corpus/, runs each through:
 *   - GPTZero public endpoint (baseline AI score)
 *   - (Future) the local /api/humanize pipeline
 *   - GPTZero again on the humanized output
 *
 * Prints a TSV-ish table to stdout and writes a JSON report so we can
 * compare runs over time. Designed to run without Copyleaks credits —
 * GPTZero free public scanner is the iteration signal.
 *
 * Caveat: GPTZero != Copyleaks. Different signal mix. Use this as a
 * directional optimization target, then validate occasional samples on
 * Copyleaks once paid credits are available again.
 *
 * Usage:
 *   node scripts/backtest-humanizer.mjs                  # all corpus files
 *   node scripts/backtest-humanizer.mjs 03 05            # only files starting with 03 / 05
 *   node scripts/backtest-humanizer.mjs --no-humanize    # only baseline scores
 *   node scripts/backtest-humanizer.mjs --preset chain   # specific Veil preset
 *
 * Requires the Next.js dev server to be running on http://localhost:3000
 * for the humanize step. Detection step calls GPTZero directly.
 */

import fs from "node:fs/promises";
import path from "node:path";

const GPTZERO_URL = "https://api.gptzero.me/v2/predict/text";
const LOCAL_HUMANIZE = "http://localhost:3000/api/humanize";
const LOCAL_DETECT = "http://localhost:3000/api/detect";
const CORPUS_DIR = path.resolve(
  new URL("..", import.meta.url).pathname,
  "research/ai-test-corpus"
);
const RUNS_DIR = path.resolve(
  new URL("..", import.meta.url).pathname,
  "research/humanizer-backtest-runs"
);

// ── flag parsing ─────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const skipHumanize = args.includes("--no-humanize");
const presetIdx = args.indexOf("--preset");
const preset =
  presetIdx >= 0 ? args[presetIdx + 1] || "chain" : "chain";
const useLocalDetector = args.includes("--local-detector");
const fileFilters = args.filter(
  (a) => !a.startsWith("--") && !["chain", "chain-strict", "minimax", "minimax-deep"].includes(a)
);

// ── helpers ──────────────────────────────────────────────────────────────
async function scanWithGptzero(text) {
  try {
    const r = await fetch(GPTZERO_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ document: text }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) {
      return { error: `gptzero http ${r.status}`, aiPct: null };
    }
    const data = await r.json();
    const doc = data?.documents?.[0];
    if (!doc) return { error: "gptzero: no documents", aiPct: null };
    const ai =
      typeof doc.completely_generated_prob === "number"
        ? doc.completely_generated_prob * 100
        : doc.class_probabilities?.ai != null
          ? doc.class_probabilities.ai * 100
          : null;
    if (ai == null) return { error: "gptzero: no ai score", aiPct: null };
    return { aiPct: ai, detector: "gptzero" };
  } catch (e) {
    return { error: String(e?.message ?? e), aiPct: null };
  }
}

async function scanWithLocalDetect(text) {
  try {
    const r = await fetch(LOCAL_DETECT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) return { error: `local http ${r.status}`, aiPct: null };
    const data = await r.json();
    return { aiPct: data.aiPct, detector: data.detector };
  } catch (e) {
    return { error: String(e?.message ?? e), aiPct: null };
  }
}

async function humanize(text, modelPreset) {
  const r = await fetch(LOCAL_HUMANIZE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      modelPreset,
      contentMode: "auto",
      referenceStyle: "direct",
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!r.ok) {
    const errBody = await r.json().catch(() => ({}));
    throw new Error(`humanize http ${r.status}: ${errBody.error ?? ""}`);
  }
  const data = await r.json();
  return data.output ?? "";
}

function fmtPct(n) {
  if (n == null) return "  --  ";
  return `${n.toFixed(1).padStart(5)}%`;
}

// ── main ─────────────────────────────────────────────────────────────────
async function main() {
  await fs.mkdir(RUNS_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[.:]/g, "-");
  const runDir = path.join(RUNS_DIR, stamp);
  await fs.mkdir(runDir, { recursive: true });

  const entries = await fs.readdir(CORPUS_DIR);
  const files = entries
    .filter((f) => f.endsWith(".txt"))
    .filter((f) => fileFilters.length === 0 || fileFilters.some((p) => f.startsWith(p)))
    .sort();

  if (files.length === 0) {
    console.log("No matching files in", CORPUS_DIR);
    return;
  }

  // GPTZero public endpoint was gated in 2026 (HTTP 401). Sapling/ZeroGPT/HF
  // inference all require API keys now. Default to local detector (our
  // /api/detect endpoint, which uses a heuristic when remote detectors are
  // unavailable). Pass --gptzero if you have an API key in env and have edited
  // scanWithGptzero to pass it.
  const scanner =
    useLocalDetector || !args.includes("--gptzero")
      ? scanWithLocalDetect
      : scanWithGptzero;
  const results = [];

  console.log(
    `\nBacktest: ${files.length} sample(s) | preset=${preset} | detector=${useLocalDetector ? "local" : "gptzero"} | humanize=${!skipHumanize}\n`
  );
  console.log(
    "file                                  baseline    post-hum    delta    detector"
  );
  console.log("-".repeat(96));

  for (const file of files) {
    const raw = await fs.readFile(path.join(CORPUS_DIR, file), "utf8");
    const baseline = await scanner(raw);
    let humanizedText = null;
    let post = { aiPct: null, detector: "" };
    let humanizeError = null;

    if (!skipHumanize) {
      try {
        humanizedText = await humanize(raw, preset);
        if (humanizedText) {
          await fs.writeFile(
            path.join(runDir, `${file.replace(/\.txt$/, "")}__${preset}.txt`),
            humanizedText
          );
          post = await scanner(humanizedText);
        }
      } catch (e) {
        humanizeError = String(e?.message ?? e);
      }
    }

    const baseScore = baseline.aiPct;
    const postScore = post.aiPct;
    const delta =
      baseScore != null && postScore != null ? postScore - baseScore : null;

    console.log(
      `${file.padEnd(38)} ${fmtPct(baseScore)}     ${fmtPct(postScore)}   ${
        delta == null ? "  --  " : (delta >= 0 ? "+" : "") + delta.toFixed(1).padStart(5)
      }   ${baseline.detector ?? baseline.error ?? "?"}`
    );
    if (humanizeError) console.log(`  humanize error: ${humanizeError}`);

    results.push({
      file,
      baseline,
      post,
      delta,
      humanizeError,
    });

    // Be polite — GPTZero rate-limits per IP
    if (!useLocalDetector) await new Promise((r) => setTimeout(r, 1500));
  }

  console.log("-".repeat(96));

  const reportPath = path.join(runDir, "report.json");
  await fs.writeFile(
    reportPath,
    JSON.stringify(
      {
        timestamp: stamp,
        preset,
        detector: useLocalDetector ? "local" : "gptzero",
        humanizeEnabled: !skipHumanize,
        results,
      },
      null,
      2
    )
  );
  console.log(`\nReport: ${reportPath}`);

  // Summary
  const withBoth = results.filter(
    (r) => r.baseline.aiPct != null && r.post.aiPct != null
  );
  if (withBoth.length > 0) {
    const meanBase =
      withBoth.reduce((a, r) => a + r.baseline.aiPct, 0) / withBoth.length;
    const meanPost =
      withBoth.reduce((a, r) => a + r.post.aiPct, 0) / withBoth.length;
    console.log(
      `\nMean AI %: ${meanBase.toFixed(1)} -> ${meanPost.toFixed(1)} (delta ${(meanPost - meanBase).toFixed(1)})`
    );
    const passes = withBoth.filter((r) => r.post.aiPct < 60).length;
    console.log(
      `Below 60%: ${passes}/${withBoth.length} samples (pass criterion)`
    );
  }
}

main().catch((e) => {
  console.error("backtest failed:", e);
  process.exit(1);
});
