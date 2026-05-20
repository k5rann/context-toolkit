#!/usr/bin/env node
// Style-anchor rewrite: rewrites AI text using a human style anchor.
// The model matches the statistical distribution of the anchor sample
// instead of following rules about "how to sound human."
//
// Usage:
//   node scripts/style-anchor-rewrite.mjs --file input.txt
//   node scripts/style-anchor-rewrite.mjs --file input.txt --anchor stealthwriter-01
//   node scripts/style-anchor-rewrite.mjs --file input.txt --chain
//   node scripts/style-anchor-rewrite.mjs --file input.txt --model "deepseek/deepseek-v4-flash"
//   node scripts/style-anchor-rewrite.mjs --list-anchors
//
// Flags:
//   --file <path>       input file (required unless --list-anchors)
//   --anchor <id>       pick a specific anchor (default: auto-detect domain)
//   --model <model>     override model (default: gemini-2.5-flash)
//   --chain             two-hop: Gemini → DeepSeek (mixes fingerprints)
//   --temperature <n>   generation temperature (default: 0.95)
//   --out <path>        write output to file instead of stdout
//   --list-anchors      show available anchors and exit
//   --all-anchors       run all anchors, save each to --out-dir
//   --out-dir <dir>     output directory for --all-anchors (default: cwd)

import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { config } from "dotenv";

const require = createRequire(import.meta.url);
const { createJiti } = require("jiti");
const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const jiti = createJiti(ROOT, { alias: { "@": ROOT } });

// Load .env.local for API keys
config({ path: path.join(ROOT, ".env.local") });

const {
  getAnchors,
  selectAnchor,
  rewriteWithStyleAnchor,
  rewriteWithStyleAnchorChain,
  rewriteHybridStyleAnchor,
} = jiti(path.join(ROOT, "lib/humanizer-style-anchor.ts"));

const argv = process.argv.slice(2);
function hasFlag(name) {
  return argv.includes(name);
}
function flagValue(name) {
  const i = argv.indexOf(name);
  return i === -1 ? null : argv[i + 1];
}

if (hasFlag("--list-anchors")) {
  const anchors = getAnchors();
  console.log("Available style anchors:\n");
  for (const a of anchors) {
    console.log(`  ${a.id.padEnd(22)} [${a.domain}] ${a.label}`);
  }
  console.log(`\n${anchors.length} anchors total`);
  process.exit(0);
}

const filePath = flagValue("--file");
if (!filePath) {
  console.error("Usage: node scripts/style-anchor-rewrite.mjs --file input.txt");
  console.error("       node scripts/style-anchor-rewrite.mjs --list-anchors");
  process.exit(2);
}

const input = fs.readFileSync(path.resolve(filePath), "utf8").trim();
if (!input) {
  console.error("style-anchor-rewrite: empty input file");
  process.exit(2);
}

const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_KEY || "";
if (!apiKey && !flagValue("--model")?.includes("/")) {
  console.error("style-anchor-rewrite: GEMINI_API_KEY not set in .env.local");
  process.exit(1);
}

const anchorId = flagValue("--anchor");
const model = flagValue("--model");
const temperature = flagValue("--temperature")
  ? parseFloat(flagValue("--temperature"))
  : 0.95;
const useChain = hasFlag("--chain");
const useHybrid = hasFlag("--hybrid");
const outPath = flagValue("--out");
const allAnchors = hasFlag("--all-anchors");
const outDir = flagValue("--out-dir") || ".";

async function runSingle(overrideAnchorId) {
  const opts = {
    text: input,
    anchorId: overrideAnchorId || anchorId,
    apiKey,
    model,
    temperature,
  };

  if (useChain) {
    const result = await rewriteWithStyleAnchorChain(opts);
    return result;
  }
  if (useHybrid) {
    return await rewriteHybridStyleAnchor(opts);
  }
  return await rewriteWithStyleAnchor(opts);
}

if (allAnchors) {
  const anchors = getAnchors();
  fs.mkdirSync(outDir, { recursive: true });

  for (const anchor of anchors) {
    console.error(`[${anchor.id}] rewriting...`);
    try {
      const result = await runSingle(anchor.id);
      const outFile = path.join(outDir, `style-anchor-${anchor.id}.txt`);
      fs.writeFileSync(outFile, result.output + "\n");
      console.error(`[${anchor.id}] done → ${outFile} (${result.model})`);
    } catch (err) {
      console.error(`[${anchor.id}] FAILED: ${err.message}`);
    }
  }
  console.error("\nAll anchors processed.");
  process.exit(0);
}

try {
  const result = await runSingle();
  const output = result.output;

  if (outPath) {
    fs.writeFileSync(path.resolve(outPath), output + "\n");
    console.error(`Written to ${outPath}`);
  } else {
    process.stdout.write(output);
    if (!output.endsWith("\n")) process.stdout.write("\n");
  }

  console.error("");
  console.error("style-anchor report");
  console.error("===================");
  console.error(`anchor:      ${result.anchorUsed}`);
  console.error(`model:       ${result.model}`);
  console.error(`temperature: ${temperature}`);
  console.error(`input words: ${input.split(/\s+/).length}`);
  console.error(`output words: ${output.split(/\s+/).length}`);
  if (result.hop1Output) {
    console.error(`hop1 words:  ${result.hop1Output.split(/\s+/).length}`);
  }
  console.error("");
} catch (err) {
  console.error(`style-anchor-rewrite failed: ${err.message}`);
  process.exit(1);
}
