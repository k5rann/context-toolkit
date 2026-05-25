# Context Toolkit

A growing suite of focused AI tools. Built with Next.js 16, Tailwind 4, shadcn/ui. Deployed on Vercel.

**Live tools:**
- **Text Humanizer** — Stealth pipeline that rewrites AI-generated text to pass AI detectors (Copyleaks-verified at 0% AI on poisoned and non-poisoned topics)
- **Context Bundler** — Vague request → master prompt with code-level validation, banned-word scanning, 9 stackable modes
- **Voice to Text** — Browser-native speech transcription
- **Conference Notes** — Continuous listening with smart extraction

---

## Text Humanizer

### How it works

The humanizer beats AI detectors by attacking multiple fingerprints in parallel:

```
Input (AI-generated text)
   │
   ▼
[1] Topic-phrase obfuscator
    Strips ~70 AI-saturated n-grams ("urban heat island effect",
    "stormwater runoff", "machine learning", "organizational
    resilience") and replaces them with casual paraphrases.
    Without this, Copyleaks' AI Source Match flags the topic
    regardless of writing style.
   │
   ▼
[2] Llama 3.1 70B adversarial sampling
    Generates 5 full-document rewrites in parallel at temps
    1.0 / 1.15 / 1.3. Each scored against a local 8-signal
    human-likeness heuristic. Best variant wins.
   │
   ▼
[3] DeepSeek-v3 hop-2 rewrite
    Re-rewrites the Llama output through a different model
    family. Mixes token-distribution fingerprints — detectors
    look for single-model patterns, this confuses them.
   │
   ▼
[4] Per-sentence Gemini variants
    Heavy / medium / light rewrites for each sentence, used
    in the click-to-swap UI for power users.
   │
   ▼
[5] Post-processing pipeline (deterministic, no API calls)
    - Em-dash kill (AI fingerprint)
    - AI adverb stripping (significantly, substantially, etc.)
    - Vocabulary perturbation (AI words → casual)
    - Contraction forcing (it is → it's)
    - Passive → active voice
    - Sentence splitting (burstiness)
    - Sentence opener variation (no two start the same)
    - Filler injection (~20% of long sentences)
    - Paragraph break variation
   │
   ▼
Output: Post-processed humanized text
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full pipeline reference and detector findings.

### Cost per request

A single humanize request fans out to ~9 LLM calls:

| Component | Calls | Model | Est. cost |
|-----------|-------|-------|-----------|
| Full-doc adversarial sampling | 5× | Llama 3.1 70B (OpenRouter) | ~$0.04 |
| Hop-2 rewrite | 1× | DeepSeek-v3 (OpenRouter) | ~$0.02 |
| Per-sentence variants | 3× per sentence | Gemini 2.5 Flash | ~$0.04 |
| **Total per request** | | | **~$0.10–0.20** |

Budget accordingly. The default rate limit (`5 req/min/IP`) caps per-user damage. Override with `HUMANIZER_RATE_LIMIT` and `HUMANIZER_RATE_LIMIT_WINDOW` env vars.

### Limitations

- **Output length floor**: Copyleaks requires ≥350 chars to scan. The API returns `tooShort: true` if output is shorter — show the user a warning.
- **Topic-saturated phrases beyond the dictionary**: The obfuscator covers the most common training-data n-grams across ~10 domains. Novel jargon will slip through and may flag. Expand `lib/humanizer-topic-obfuscator.ts` as new failures appear.
- **Latency**: ~30–50s per request due to sequential hop-2 + adversarial sampling. Vercel function timeout is set to 120s.
- **Detector arms race**: Detectors update. Whatever works today may not in 6 months. Plan to re-test against Copyleaks quarterly.

---

## Run locally

```bash
git clone https://github.com/<you>/context-toolkit.git
cd context-toolkit
npm install
cp .env.example .env.local
# Edit .env.local — set BOTH GEMINI_API_KEY and OPENROUTER_API_KEY
npm run dev
```

Open http://localhost:3000.

### Required environment variables

| Var | Where to get it | Used for |
|-----|----------------|----------|
| `GEMINI_API_KEY` | https://aistudio.google.com/app/apikey | Per-sentence rewrites, free-tier fallback |
| `OPENROUTER_API_KEY` | https://openrouter.ai/keys | Llama 3.1 70B + DeepSeek-v3 stealth path |

Both are required for the Stealth pipeline. Without `OPENROUTER_API_KEY`, the humanizer degrades to single-model output that does NOT pass Copyleaks.

### Optional environment variables

| Var | Default | Effect |
|-----|---------|--------|
| `APP_PASSWORD` | unset (open access) | Password gate for the whole toolkit |
| `HUMANIZER_RATE_LIMIT` | `5` | Max humanize requests per IP per window |
| `HUMANIZER_RATE_LIMIT_WINDOW` | `60` | Window length in seconds |

---

## Deploy to Vercel

1. Push to GitHub
2. Import the repo at https://vercel.com/new
3. Set environment variables in Vercel project settings — at minimum:
   - `GEMINI_API_KEY`
   - `OPENROUTER_API_KEY`
4. Deploy

### Function timeout note

`/api/humanize-alternatives` has `maxDuration = 120`. Vercel Hobby tier caps function duration at 60s — you'll need at least the Pro plan for the humanizer to run end-to-end on long inputs.

---

## Architecture

- **Next.js 16** App Router, runtime `nodejs` for API routes
- **React 19** + Tailwind CSS 4 + shadcn/ui
- **LLM routing** via `lib/llm.ts` — Gemini SDK direct, OpenRouter via `lib/openrouter.ts`
- **Rate limiting** in-memory IP buckets (`lib/rate-limit.ts`). Resets on cold start; swap for Upstash Redis if abuse appears in production.
- **No database** — stateless pipeline, no user data persisted.

---

## Testing

Smoke test for the main pipeline:

```bash
npm run dev   # in one terminal
npm run smoke # in another (or `node scripts/smoke-humanizer.mjs`)
```

The smoke test calls `/api/humanize-alternatives` with a known input, checks the output is non-empty, isn't `tooShort`, and that the obfuscator swapped at least one poisoned phrase. Fails loudly if the pipeline is broken.

---

## License

MIT — see [LICENSE](./LICENSE).

## Built by

[Karanvir Panwar](mailto:karanvirsp8077@gmail.com)
