#!/usr/bin/env node
/**
 * StealthWriter pair collector — uses the reverse-engineered API
 * (see research/stealthwriter-recon/API-CRACKED.md) to fetch humanized
 * outputs for our corpus. Saves (input, output) pairs as training data
 * for knowledge-distillation fine-tuning.
 *
 * IMPORTANT:
 *   - Requires valid StealthWriter session cookies from a logged-in browser
 *     (see SESSION_COOKIES env var format below).
 *   - StealthWriter Free Plan has daily caps — script paces requests with
 *     a delay and resumes from last saved pair.
 *   - Uses your personal account. ToS prohibits commercial use of outputs.
 *     This data is for personal training experiments only.
 *
 * Encryption (XOR + salt + base64):
 *   static_key  = "sw_r3sp0ns3_k3y_2024!xQ9"   (24 chars)
 *   salt        = random 12-char string per request
 *   full_key    = static_key + salt             (36 chars, repeating XOR)
 *   encode:     JSON -> XOR with full_key -> base64
 *   send:       { d: <base64>, s: <salt> }
 *   decode:     reverse of above
 *
 * Usage:
 *   # First, set cookies in .env.local:
 *   #   SW_SESSION_TOKEN="<value of __Secure-better-auth.session_token>"
 *   #   SW_SESSION_DATA="<value of __Secure-better-auth.session_data>"
 *   #   SW_FINGERPRINT="<md5 device fingerprint from browser dev tools>"
 *
 *   node --env-file=.env.local scripts/collect-stealthwriter-pairs.mjs
 *   node --env-file=.env.local scripts/collect-stealthwriter-pairs.mjs --level 8 --model 3
 *   node --env-file=.env.local scripts/collect-stealthwriter-pairs.mjs --inputs research/training-inputs/*.txt
 *
 * Output:
 *   research/sw-pairs/<sample-id>.json   — {input, output, level, model, ts}
 *   research/sw-pairs/index.tsv          — append-only progress log
 */

import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const PAIRS_DIR = path.join(ROOT, "research/sw-pairs");
const INDEX_PATH = path.join(PAIRS_DIR, "index.tsv");

const STATIC_KEY = "sw_r3sp0ns3_k3y_2024!xQ9";
const SW_URL = "https://stealthwriter.ai/api/humanize";

// ── flag parsing ────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function flag(name, fallback) {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
}
const LEVEL = Number(flag("--level", "8"));
const MODEL = Number(flag("--model", "3")); // 3 = Ghost 5.2 Mini
const DELAY_MS = Number(flag("--delay", "12000")); // 12s between requests
const INPUTS_GLOB = flag("--inputs", null);
const RESUME = !args.includes("--no-resume");

// ── env ─────────────────────────────────────────────────────────────────
const SESSION_TOKEN = process.env.SW_SESSION_TOKEN;
const SESSION_DATA = process.env.SW_SESSION_DATA;
const FINGERPRINT = process.env.SW_FINGERPRINT;
if (!SESSION_TOKEN || !SESSION_DATA || !FINGERPRINT) {
  console.error(
    "Missing one of: SW_SESSION_TOKEN, SW_SESSION_DATA, SW_FINGERPRINT.\n" +
      "Grab them from your browser dev tools while logged into stealthwriter.ai:\n" +
      "  Application > Cookies > __Secure-better-auth.session_token\n" +
      "  Application > Cookies > __Secure-better-auth.session_data\n" +
      "  Network tab: find a /api/humanize request, decrypt payload, grab fp field"
  );
  process.exit(1);
}

// ── XOR + base64 codec ──────────────────────────────────────────────────
function randomSalt(n = 12) {
  const chars =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = "";
  for (let i = 0; i < n; i++) {
    out += chars[crypto.randomInt(0, chars.length)];
  }
  return out;
}

function xorEncode(plainText, fullKey) {
  const out = [];
  for (let i = 0; i < plainText.length; i++) {
    out.push(
      String.fromCharCode(
        plainText.charCodeAt(i) ^ fullKey.charCodeAt(i % fullKey.length)
      )
    );
  }
  return out.join("");
}

function encodeRequest(payloadObj) {
  const salt = randomSalt(12);
  const fullKey = STATIC_KEY + salt;
  const json = JSON.stringify(payloadObj);
  const xored = xorEncode(json, fullKey);
  const b64 = Buffer.from(xored, "binary").toString("base64");
  return { d: b64, s: salt };
}

function decodeResponse(envelope) {
  const { d, s } = envelope;
  const fullKey = STATIC_KEY + s;
  const xored = Buffer.from(d, "base64").toString("binary");
  const json = xorEncode(xored, fullKey); // XOR is symmetric
  return JSON.parse(json);
}

// ── StealthWriter call ──────────────────────────────────────────────────
async function humanizeViaSW(text) {
  const inner = {
    text,
    level: LEVEL,
    model: MODEL,
    fp: FINGERPRINT,
    is_rehumanize: false,
  };
  const envelope = encodeRequest(inner);

  const res = await fetch(SW_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `__Secure-better-auth.session_token=${SESSION_TOKEN}; __Secure-better-auth.session_data=${SESSION_DATA}`,
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    },
    body: JSON.stringify(envelope),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`SW HTTP ${res.status}: ${t.slice(0, 200)}`);
  }
  const body = await res.json();
  const decoded = decodeResponse(body);

  // decoded.sentences[].alternatives — top-ranked is the humanized output
  if (!decoded.sentences) {
    throw new Error(`SW response missing sentences: ${JSON.stringify(decoded).slice(0, 200)}`);
  }
  const stitched = decoded.sentences
    .map((s) => {
      const top = (s.alternatives || []).sort(
        (a, b) => (b.rank ?? 0) - (a.rank ?? 0)
      )[0];
      return top ? top.sentence : s.original;
    })
    .join(" ");
  return { output: stitched, raw: decoded };
}

// ── input loader ────────────────────────────────────────────────────────
async function loadInputs() {
  // Default corpus: 5 ai-test-corpus + 6 phrase-chase inputs
  const samples = [];

  if (INPUTS_GLOB) {
    // Treat as comma-separated file list (skip real glob expansion)
    for (const fpath of INPUTS_GLOB.split(",").map((s) => s.trim())) {
      const text = (await fs.readFile(fpath, "utf8")).trim();
      const id = path.basename(fpath, path.extname(fpath));
      samples.push({ id, text });
    }
    return samples;
  }

  const corpusDir = path.join(ROOT, "research/ai-test-corpus");
  for (const f of (await fs.readdir(corpusDir)).sort()) {
    if (!f.endsWith(".txt")) continue;
    samples.push({
      id: `corpus-${f.replace(/\.txt$/, "")}`,
      text: (await fs.readFile(path.join(corpusDir, f), "utf8")).trim(),
    });
  }
  const pcDir = path.join(ROOT, "research/phrase-chase");
  const pairs = (await fs.readdir(pcDir, { withFileTypes: true }))
    .filter((e) => e.isDirectory() && e.name.startsWith("pair-"))
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const d of pairs) {
    const p = path.join(pcDir, d.name, "input.txt");
    try {
      const text = (await fs.readFile(p, "utf8")).trim();
      if (text) samples.push({ id: `phrase-${d.name}`, text });
    } catch {
      // skip
    }
  }
  return samples;
}

// ── main ────────────────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  await fs.mkdir(PAIRS_DIR, { recursive: true });
  if (!existsSync(INDEX_PATH)) {
    await fs.writeFile(
      INDEX_PATH,
      "ts\tsample_id\tlevel\tmodel\tin_words\tout_words\tstatus\terror\n",
      "utf8"
    );
  }

  const samples = await loadInputs();
  process.stderr.write(
    `[sw-collect] level=${LEVEL} model=${MODEL} samples=${samples.length} delay=${DELAY_MS}ms\n`
  );

  let kept = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    const outPath = path.join(
      PAIRS_DIR,
      `${sample.id}.lvl${LEVEL}.mdl${MODEL}.json`
    );
    if (RESUME && existsSync(outPath)) {
      skipped += 1;
      process.stderr.write(
        `  [${i + 1}/${samples.length}] ${sample.id} — already collected, skip\n`
      );
      continue;
    }

    const t0 = Date.now();
    try {
      const { output, raw } = await humanizeViaSW(sample.text);
      const pair = {
        ts: new Date().toISOString(),
        sample_id: sample.id,
        level: LEVEL,
        model: MODEL,
        input: sample.text,
        output,
        sentences: raw.sentences,
      };
      await fs.writeFile(outPath, JSON.stringify(pair, null, 2), "utf8");
      const inWords = (sample.text.match(/\S+/g) || []).length;
      const outWords = (output.match(/\S+/g) || []).length;
      await fs.appendFile(
        INDEX_PATH,
        `${pair.ts}\t${sample.id}\t${LEVEL}\t${MODEL}\t${inWords}\t${outWords}\tok\t\n`
      );
      kept += 1;
      process.stderr.write(
        `  [${i + 1}/${samples.length}] ${sample.id.padEnd(40)} ok  ${inWords}->${outWords} words  ${((Date.now() - t0) / 1000).toFixed(1)}s\n`
      );
    } catch (e) {
      failed += 1;
      const msg = (e.message || String(e)).slice(0, 200);
      await fs.appendFile(
        INDEX_PATH,
        `${new Date().toISOString()}\t${sample.id}\t${LEVEL}\t${MODEL}\t\t\tfail\t${msg.replace(/\t|\n/g, " ")}\n`
      );
      process.stderr.write(
        `  [${i + 1}/${samples.length}] ${sample.id.padEnd(40)} FAIL  ${msg}\n`
      );
      // If it looks like rate-limit / quota, back off harder
      if (/429|quota|limit|exceeded/i.test(msg)) {
        process.stderr.write(`  -> rate-limit detected, sleeping 60s\n`);
        await sleep(60_000);
      }
    }

    if (i < samples.length - 1) await sleep(DELAY_MS);
  }

  process.stderr.write(
    `[sw-collect] done. kept=${kept} skipped=${skipped} failed=${failed}\n`
  );
}

main().catch((err) => {
  console.error(`[sw-collect] fatal: ${err.message || err}`);
  process.exit(2);
});
