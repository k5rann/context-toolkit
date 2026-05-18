#!/usr/bin/env node

import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);
const { createJiti } = require("jiti");

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const CORPUS_PATH = path.join(ROOT, "research/humanizer-model-swap-corpus.json");
const RUNS_DIR = path.join(ROOT, "research/humanizer-model-swap-runs");

const jiti = createJiti(ROOT, {
  alias: {
    "@": ROOT,
  },
});

const {
  humanize,
  cleanHumanizerOutputForTest,
} = jiti(path.join(ROOT, "lib/humanizer.ts"));
const { generate } = jiti(path.join(ROOT, "lib/llm.ts"));
const {
  buildChainHop1Prompt,
  buildChainHop2Prompt,
} = jiti(path.join(ROOT, "lib/prompts/humanizer-template.ts"));

const ROUTES = [
  {
    id: "current-chain",
    label: "Current app chain",
    type: "app-chain",
    modelPreset: "chain",
    notes: "Production research baseline: current 2-hop Standard route.",
  },
  {
    id: "current-strict",
    label: "Current strict chain",
    type: "app-chain",
    modelPreset: "chain-strict",
    notes: "Current strict route; preserves facts but usually weaker for detectors.",
  },
  {
    id: "qwen-free",
    label: "Qwen direct",
    type: "direct",
    model: "qwen/qwen3-next-80b-a3b-instruct:free",
    notes: "Qwen free variant from OpenRouter's current free-model list.",
  },
  {
    id: "deepseek-v4",
    label: "DeepSeek direct",
    type: "direct",
    model: "deepseek/deepseek-v4-flash",
    notes: "Current DeepSeek route from OpenRouter model list; not marked free.",
  },
  {
    id: "minimax-free",
    label: "MiniMax direct",
    type: "direct",
    model: "minimax/minimax-m2.5:free",
    notes: "MiniMax route from prior Humanizer experiments.",
  },
  {
    id: "openrouter-free",
    label: "OpenRouter free router",
    type: "direct",
    model: "openrouter/free",
    notes: "Random current free model. Useful scout, not a controlled route.",
  },
  {
    id: "qwen-deepseek-chain",
    label: "Qwen -> DeepSeek chain",
    type: "manual-chain",
    hop1Model: "qwen/qwen3-next-80b-a3b-instruct:free",
    hop2Model: "deepseek/deepseek-v4-flash",
    notes: "Two different model families with the app's chain prompts; DeepSeek route is not marked free.",
  },
  {
    id: "deepseek-qwen-chain",
    label: "DeepSeek -> Qwen chain",
    type: "manual-chain",
    hop1Model: "deepseek/deepseek-v4-flash",
    hop2Model: "qwen/qwen3-next-80b-a3b-instruct:free",
    notes: "Reverse order of the Qwen/DeepSeek chain.",
  },
];

function usage() {
  console.log(`Humanizer model-swap research runner

Usage:
  node scripts/run-humanizer-model-swap.mjs --dry-run
  node scripts/run-humanizer-model-swap.mjs --check-models
  node scripts/run-humanizer-model-swap.mjs --run --sample ai-generic-essay --route qwen-free
  node scripts/run-humanizer-model-swap.mjs --run --limit 10 --routes current-chain,qwen-free,deepseek-v4,minimax-free

Options:
  --dry-run              Print corpus/routes, make no network calls. Default.
  --check-models         Fetch OpenRouter /models and report configured model availability.
  --run                  Generate outputs into research/humanizer-model-swap-runs/.
  --sample <id>          Run one corpus sample.
  --route <id>           Run one route.
  --routes <a,b,c>       Run selected routes.
  --limit <n>            Limit samples after filtering.
  --timeout-ms <n>       Per model call timeout. Default 45000.

Copyleaks is manual:
  1. Run generation.
  2. Open the generated copyleaks-results-template.md.
  3. Paste each output into Copyleaks.
  4. Fill % AI and AI phrase count in the table.
`);
}

function parseArgs(argv) {
  const args = {
    mode: "dry-run",
    sample: null,
    routes: null,
    limit: null,
    timeoutMs: 45000,
  };

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--dry-run") args.mode = "dry-run";
    else if (token === "--check-models") args.mode = "check-models";
    else if (token === "--run") args.mode = "run";
    else if (token === "--sample") args.sample = argv[++i];
    else if (token === "--route") args.routes = [argv[++i]];
    else if (token === "--routes") args.routes = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    else if (token === "--limit") args.limit = Number(argv[++i]);
    else if (token === "--timeout-ms") args.timeoutMs = Number(argv[++i]);
    else if (token === "--help" || token === "-h") {
      usage();
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${token}`);
    }
  }

  return args;
}

async function loadEnvLocal() {
  const envPath = path.join(ROOT, ".env.local");
  try {
    const raw = await fs.readFile(envPath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) continue;
      const [, key, value] = match;
      if (!process.env[key]) {
        process.env[key] = value.replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    // .env.local is optional for dry-run.
  }
}

async function loadCorpus() {
  return JSON.parse(await fs.readFile(CORPUS_PATH, "utf8"));
}

function filterItems(corpus, args) {
  let samples = corpus;
  if (args.sample) {
    samples = samples.filter((sample) => sample.id === args.sample);
    if (samples.length === 0) throw new Error(`Unknown sample id: ${args.sample}`);
  }
  if (Number.isFinite(args.limit) && args.limit > 0) {
    samples = samples.slice(0, args.limit);
  }

  let routes = ROUTES;
  if (args.routes) {
    const wanted = new Set(args.routes);
    routes = ROUTES.filter((route) => wanted.has(route.id));
    const found = new Set(routes.map((route) => route.id));
    const missing = args.routes.filter((route) => !found.has(route));
    if (missing.length) throw new Error(`Unknown route id(s): ${missing.join(", ")}`);
  }

  return { samples, routes };
}

function wordCount(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

function directPrompt(sample) {
  const wc = wordCount(sample.text);
  const minWords = Math.max(80, Math.floor(wc * 0.7));
  const maxWords = Math.max(minWords + 20, Math.ceil(wc * 1.05));

  return `Rewrite the source text as a human draft in the same genre.

Rules:
- Preserve every fact, name, number, place, and claim from the source.
- Do not add examples, research, citations, guarantees, or personal stories.
- Keep the output ${minWords}-${maxWords} words.
- Remove generic AI phrasing, polished essay framing, and sales filler.
- Vary sentence length. A few sentences can be blunt or slightly awkward.
- Output only the rewritten text. No labels, no commentary, no markdown.

Source:
${sample.text}

Rewritten text:`;
}

async function callDirectRoute(sample, route, timeoutMs) {
  const raw = await generate({
    apiKey: process.env.OPENROUTER_API_KEY ?? "",
    prompt: directPrompt(sample),
    preferredModel: route.model,
    temperature: 0.95,
    timeoutMs,
  });
  return {
    output: cleanHumanizerOutputForTest(raw),
    generator: route.model,
    passes: 1,
  };
}

async function callManualChain(sample, route, timeoutMs) {
  const hop1Raw = await generate({
    apiKey: process.env.OPENROUTER_API_KEY ?? "",
    prompt: buildChainHop1Prompt({
      text: sample.text,
      contentMode: "auto",
    }),
    preferredModel: route.hop1Model,
    temperature: 1.05,
    timeoutMs,
  });
  const hop1Output = cleanHumanizerOutputForTest(hop1Raw);

  const hop2Raw = await generate({
    apiKey: process.env.OPENROUTER_API_KEY ?? "",
    prompt: buildChainHop2Prompt({
      text: hop1Output,
      contentMode: "auto",
    }),
    preferredModel: route.hop2Model,
    temperature: 1.15,
    timeoutMs,
  });

  return {
    output: cleanHumanizerOutputForTest(hop2Raw),
    generator: `${route.hop1Model} -> ${route.hop2Model}`,
    pass1Output: hop1Output,
    passes: 2,
  };
}

async function callAppChain(sample, route) {
  const result = await humanize({
    text: sample.text,
    contentMode: "auto",
    referenceStyle: "direct",
    modelPreset: route.modelPreset,
    apiKey: process.env.OPENROUTER_API_KEY ?? "",
  });
  return {
    output: result.output,
    generator:
      result.quality?.notes?.find((note) => note.startsWith("Generator:")) ??
      route.modelPreset,
    pass1Output: result.pass1Output,
    passes: result.passes,
  };
}

async function generateOne(sample, route, timeoutMs) {
  if (route.type === "app-chain") return callAppChain(sample, route);
  if (route.type === "direct") return callDirectRoute(sample, route, timeoutMs);
  if (route.type === "manual-chain") return callManualChain(sample, route, timeoutMs);
  throw new Error(`Unsupported route type: ${route.type}`);
}

function hasLeak(output) {
  return /content type detected|apply journalism rules|^\s*---\s*$|\*\*/im.test(output);
}

async function checkModels(routes) {
  const res = await fetch("https://openrouter.ai/api/v1/models");
  if (!res.ok) throw new Error(`OpenRouter models API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const ids = new Set((data.data ?? []).map((model) => model.id));
  const modelIds = Array.from(
    new Set(
      routes.flatMap((route) => [
        route.model,
        route.hop1Model,
        route.hop2Model,
      ]).filter(Boolean)
    )
  );

  for (const id of modelIds) {
    const status = id === "openrouter/free" || ids.has(id) ? "ok" : "missing";
    console.log(`${status.padEnd(8)} ${id}`);
  }
}

function makeRunId() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function writeRunFiles(runDir, rows, routes, samples) {
  await fs.mkdir(runDir, { recursive: true });
  await fs.writeFile(
    path.join(runDir, "outputs.json"),
    JSON.stringify({ createdAt: new Date().toISOString(), routes, samples, rows }, null, 2)
  );

  const tsvLines = [
    "sample_id\tsample_category\troute_id\troute_label\tmodel\tinput_words\toutput_words\tpasses\tleak_detected\tcopyleaks_ai_pct\tcopyleaks_ai_phrases\tnotes",
    ...rows.map((row) =>
      [
        row.sampleId,
        row.sampleCategory,
        row.routeId,
        row.routeLabel,
        row.generator,
        row.inputWords,
        row.outputWords,
        row.passes,
        row.leakDetected ? "yes" : "no",
        "",
        "",
        row.error ? `ERROR: ${row.error}` : "",
      ].map((cell) => String(cell).replace(/\t/g, " ")).join("\t")
    ),
  ];
  await fs.writeFile(path.join(runDir, "copyleaks-results.tsv"), `${tsvLines.join("\n")}\n`);

  const md = [
    "# Humanizer Model-Swap Copyleaks Results",
    "",
    `Created: ${new Date().toISOString()}`,
    "",
    "Fill `Copyleaks % AI` and `AI phrases` manually after testing each output.",
    "",
    "| Sample | Category | Route | Model | Input words | Output words | Leak? | Copyleaks % AI | AI phrases | Notes |",
    "|---|---|---|---|---:|---:|---|---:|---:|---|",
    ...rows.map((row) =>
      `| ${row.sampleId} | ${row.sampleCategory} | ${row.routeId} | ${row.generator} | ${row.inputWords} | ${row.outputWords} | ${row.leakDetected ? "yes" : "no"} |  |  | ${row.error ? `ERROR: ${row.error.replace(/\|/g, "/")}` : ""} |`
    ),
    "",
    "Pass criterion from Claude handoff: model route drops below 60% AI on at least 7 of 10 fixed samples.",
  ];
  await fs.writeFile(path.join(runDir, "copyleaks-results-template.md"), `${md.join("\n")}\n`);

  for (const row of rows) {
    const fileName = `${row.sampleId}__${row.routeId}.txt`;
    await fs.writeFile(path.join(runDir, fileName), row.output ?? "");
  }

  const pastePackDir = path.join(runDir, "paste-packs");
  await fs.mkdir(pastePackDir, { recursive: true });
  for (const route of routes) {
    const routeRows = rows.filter((row) => row.routeId === route.id && row.output);
    if (routeRows.length === 0) continue;
    const pack = routeRows
      .map((row) => row.output.trim())
      .filter(Boolean)
      .join("\n\n");
    await fs.writeFile(path.join(pastePackDir, `${route.id}.txt`), `${pack}\n`);
  }
}

async function runGeneration(args, samples, routes) {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY missing. Add it to .env.local before --run.");
  }

  const runDir = path.join(RUNS_DIR, makeRunId());
  const rows = [];

  for (const sample of samples) {
    for (const route of routes) {
      const label = `${sample.id} / ${route.id}`;
      process.stdout.write(`running ${label} ... `);
      try {
        const result = await generateOne(sample, route, args.timeoutMs);
        rows.push({
          sampleId: sample.id,
          sampleCategory: sample.category,
          routeId: route.id,
          routeLabel: route.label,
          generator: result.generator,
          inputWords: wordCount(sample.text),
          outputWords: wordCount(result.output),
          passes: result.passes,
          leakDetected: hasLeak(result.output),
          output: result.output,
          pass1Output: result.pass1Output,
        });
        console.log("ok");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        rows.push({
          sampleId: sample.id,
          sampleCategory: sample.category,
          routeId: route.id,
          routeLabel: route.label,
          generator: route.model ?? `${route.hop1Model ?? ""} -> ${route.hop2Model ?? ""}`,
          inputWords: wordCount(sample.text),
          outputWords: 0,
          passes: 0,
          leakDetected: false,
          output: "",
          error: message,
        });
        console.log(`failed: ${message.slice(0, 180)}`);
      }
    }
  }

  await writeRunFiles(runDir, rows, routes, samples);
  console.log(`\nWrote run: ${runDir}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await loadEnvLocal();
  const corpus = await loadCorpus();
  const { samples, routes } = filterItems(corpus, args);

  if (args.mode === "dry-run") {
    usage();
    console.log("Samples:");
    for (const sample of samples) {
      console.log(`- ${sample.id} (${sample.category}, ${wordCount(sample.text)} words)`);
    }
    console.log("\nRoutes:");
    for (const route of routes) {
      console.log(`- ${route.id}: ${route.label} [${route.type}]`);
    }
    return;
  }

  if (args.mode === "check-models") {
    await checkModels(routes);
    return;
  }

  if (args.mode === "run") {
    await runGeneration(args, samples, routes);
    return;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
