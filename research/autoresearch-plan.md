# Autoresearch Plan: Build a Copyleaks-Beating Humanizer

**Status**: scaffolded 2026-05-18, awaiting wifi to kick off
**Branch**: `stealth-preset-working`
**Goal**: Build a humanizer preset that scores ≤ 20% AI on Copyleaks across ≥ 4 of 5 sample genres (casual, business, tech, academic, product). Treat StealthWriter (which we've confirmed at 0% AI on Copyleaks for our business + casual inputs) as the reference target.

## Current state

| Preset | Copyleaks AI% (3-sample test 2026-05-18) | Status |
|---|---:|---|
| `chain` (production default) | 100% | Confirmed fail |
| `stealth` (style-anchor) | 100% | Confirmed fail |
| `stealth-verbose` (anti-concision prompt v1) | 100% | Confirmed fail — also has trailer-copying bug |
| `stealth-verbose-v2` (refined prompt, trailer bug fixed) | ??? | Scaffolded, not yet tested |
| `stealth-sentence` (per-sentence alternates, SW architecture) | ??? | Scaffolded, not yet tested |
| StealthWriter (external reference) | 0% | Confirmed pass — but their model lives on their servers |

## What we learned

1. **Copyleaks has two independent signals**: `AI Source Match` (corpus matching) and `AI Logic` (stylometric fingerprint). Our presets sometimes fool Match% but never AI%. StealthWriter fools both.
2. **Trigger words are not the issue.** StealthWriter outputs use "game-changer", "cutting-edge" etc. and still score 0%. The detector is reading deeper features.
3. **Gemini 2.5 Flash has a persistent AI fingerprint** that surface-level prompt rules don't break.
4. **Sample size matters.** 3 samples is enough to confirm a fail. Will need ≥ 30 for confident "ship" decision.

## The autoresearch loop, when wifi returns

### Verify command (mechanical metric)

```bash
node --env-file=.env.local scripts/sapling-verify.mjs --preset <name>
```

Outputs a single number to stdout: mean Sapling AI% across the corpus (lower = better). Per-sample progress goes to stderr.

**Why Sapling, not Copyleaks**: Copyleaks has no public API, each scan burns a credit. Sapling's free tier (5K req/mo) is the only mechanical signal that approximates "AI detector AI%". We spot-check final winners on Copyleaks manually.

### Required env (in `.env.local`)

```
GEMINI_API_KEY=...          # already present
OPENROUTER_API_KEY=...      # already present (for chain preset hop 2)
SAPLING_API_KEY=...         # NEEDS TO BE ADDED — get from sapling.ai
```

For the StealthWriter pair collector (optional, only for the distillation path):

```
SW_SESSION_TOKEN=...        # __Secure-better-auth.session_token cookie
SW_SESSION_DATA=...         # __Secure-better-auth.session_data cookie
SW_FINGERPRINT=...          # MD5 device fingerprint (decrypt one request to find it)
```

### Scope (what the loop can modify)

Full system:
- `lib/humanizer-verbose-prompt*.ts` — prompts
- `lib/humanizer-sentence-alternates.ts` — sentence-level architecture
- `lib/humanizer-*.ts` — supporting modules
- `lib/humanizer.ts` — preset dispatch
- `scripts/*.mjs` — pipeline, training data collection, fine-tune drivers

### Bound

Unbounded with 15-iteration plateau detection.

### Direction

Lower is better.

### Establish baseline (first thing to do after wifi)

```bash
# Baselines for the 4 existing presets
for p in chain stealth stealth-verbose stealth-verbose-v2 stealth-sentence; do
  echo "=== $p ==="
  npm run verify:sapling -- --preset $p --save
done
```

These four numbers become iteration #0 in the results log.

### Iteration directions (in cost-order)

The loop should prefer cheap experiments first. When a tier plateaus, escalate.

**Tier 1 — Prompt engineering** (cheap, ~$0.50/iter):
- Tweak verbose prompt v2 — add/remove rules, adjust register
- Try different rewrite models in stealth-verbose: Claude Haiku, GPT-4o-mini, Llama 3.3 70B
- Two-stage prompts (rewrite, then critique-and-rewrite)
- Different temperatures, top-p

**Tier 2 — Pipeline architecture** (medium, ~$2/iter):
- Refine stealth-sentence: adjust per-sentence alternate count, ranking criteria
- Add a post-processing layer that detects and breaks remaining AI patterns
- Chain stealth-sentence → stealth-verbose-v2 (compound)
- Add a "second-pass critic" that rejects sentences and regenerates

**Tier 3 — Knowledge distillation** (expensive, ~$50-200 total + days of work):
- Collect 500-2000 (input, StealthWriter-output) pairs via `scripts/collect-stealthwriter-pairs.mjs`
- Fine-tune Gemini Flash on the pairs (Google AI Studio: ~$50-150)
- Or fine-tune Llama 3 8B / Mistral 7B on rented GPU (~$100-300)
- Replace `stealth-verbose-v2` preset rewriteModel with the fine-tuned model

**Tier 4 — Detector-in-the-loop** (very expensive):
- Build a feedback loop that uses Sapling score as RL reward
- Generate → score → reinforce high-scoring outputs → fine-tune again
- This is "training against the detector" — diminishing returns once Sapling-fooling outputs don't transfer to Copyleaks

### Stop conditions

- Goal achieved: Sapling mean ≤ 20% across 30+ samples, manually confirmed on ≥ 3 Copyleaks paste-tests at ≤ 30%
- Plateau: 15 iterations without a new best — pause, surface options to user
- Budget: $500 cumulative LLM + detector + GPU spend
- Time: After internship hand-off (2026-06-01), revisit only if humanizer is core deliverable

## Resume protocol for a fresh session

1. Read this file
2. Read `git log --oneline -20` on `stealth-preset-working` branch to see what's been tried
3. Read `research/autoresearch-runs/results-log.tsv` for per-iteration metric history
4. Read the 3 most recent `research/autoresearch-runs/*.json` to see what the last few iterations did
5. Pick a Tier 1 experiment that hasn't been tried and run one iteration manually first
6. If it works, invoke `/autoresearch` to continue automatically

## What's NOT in scope (decided 2026-05-18)

- **Using StealthWriter API in production** — ToS prohibits commercial use; rate limits make it impractical anyway. Collector script (`collect-stealthwriter-pairs.mjs`) is for personal data collection only, NOT a runtime route.
- **Building our own AI detector** — adds complexity without buying us Copyleaks evasion
- **Pursuing chain preset improvements** — chain is being kept as "recovery / strict" mode, not optimized further

## File index

| File | Purpose |
|---|---|
| `scripts/sapling-verify.mjs` | Verify command for the loop |
| `scripts/collect-stealthwriter-pairs.mjs` | Personal-use training data collector |
| `scripts/compare-chain-vs-stealth.mjs` | Side-by-side comparison with lexical metrics (no detector) |
| `lib/humanizer-verbose-prompt.ts` | v1 verbose prompt (has trailer-copy bug) |
| `lib/humanizer-verbose-prompt-v2.ts` | v2 verbose prompt (trailer-copy bug fixed) |
| `lib/humanizer-sentence-alternates.ts` | Sentence-level per-sentence rewriting |
| `lib/humanizer.ts` | Preset dispatch + PRESET_MODELS table |
| `lib/prompts/humanizer-template.ts` | Type + UI registration |
| `research/autoresearch-runs/` | Per-iteration outputs + results log (created on first run) |
| `research/sw-pairs/` | Collected (input, SW-output) training pairs (created on first collect run) |
| `research/main-vs-stealth-runs/` | Earlier comparison runs + Copyleaks test packs |
| `research/stealthwriter-recon/API-CRACKED.md` | Cracked transport protocol reference |
