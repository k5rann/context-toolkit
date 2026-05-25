# Veil Stealth — Architecture & Findings

## What We Built

A multi-stage humanization pipeline that takes AI-generated text and produces output that passes Copyleaks AI detection (0% AI) on non-poisoned topics.

## Pipeline

```
Input (AI text, 100% AI on Copyleaks)
  |
  v
[1] Llama 3.1 70B via OpenRouter
    - Stealth prompt: casual-forum style anchor + 12 hard rules
    - Temperature 1.1
    - Full-document rewrite (preserves document-level coherence)
  |
  v
[2] Per-sentence alternatives (Gemini 2.5 Flash)
    - 3 variants per sentence: heavy / medium / light
    - Each uses buildSentencePrompt() with style anchor
    - 15s timeout per call, parallel execution
  |
  v
[3] Post-processing pipeline (deterministic, no API calls)
    - Em-dash removal (AI fingerprint)
    - AI adverb stripping (significantly, substantially, etc.)
    - Vocabulary perturbation (AI words → casual alternatives)
    - Contraction forcing (it is → it's, do not → don't)
    - Passive voice reduction
    - Sentence splitting (long → short at natural break points)
    - Short sentence merging (adjacent fragments → compound)
    - Sentence opener variation (no two start the same way)
    - Filler injection (~20% of sentences, 8+ words only)
    - Paragraph break variation (burstiness)
  |
  v
[4] Sentence-level alternatives UI
    - Top alternative: full-doc Llama rewrite (rank-boosted +0.1)
    - 3 per-sentence variants from Gemini
    - Original text (rank 0.01, always last)
    - Click-to-swap cycling in the UI
  |
  v
Output: composedOutput (post-processed) → user copies this
```

## Files

| File | Purpose |
|------|---------|
| `lib/humanizer-alternatives.ts` | Core engine — generates alternatives, composes output |
| `lib/humanizer-postprocess.ts` | Deterministic post-processing pipeline |
| `lib/humanizer-style-anchor.ts` | Style anchors + prompt templates (buildStealthPrompt, buildHybridStylePrompt) |
| `lib/humanizer.ts` | Original humanizer (non-stealth presets) |
| `lib/llm.ts` | LLM routing — Gemini direct or OpenRouter |
| `lib/openrouter.ts` | OpenRouter client (Llama, MiniMax, etc.) |
| `app/api/humanize-alternatives/route.ts` | API endpoint for stealth mode |
| `components/humanizer-clean/humanizer-clean-page.tsx` | UI with SentenceSpan click-to-swap |

## Key Findings

### Model Shootout (Copyleaks testing)

All models tested on same cybersecurity input with stealth prompt:

| Model | AI Phrases | Result | Notes |
|-------|-----------|--------|-------|
| Gemini 2.5 Flash | 6-8 | 100% AI | Compresses text, keeps AI structure |
| Claude 3.5 Haiku | 6 | 100% AI | Best voice but still detected |
| Llama 3.1 70B | 3 | 100% AI | Fewest AI phrases, closest to passing |
| Mistral Large | 4 | 100% AI | Too telegraphic |
| Qwen 2.5 72B | 5 | 100% AI | Over-simplified |
| DeepSeek v3 | 8+ | 100% AI | Hallucinated facts, 99%+ detection rate |
| Cohere Command-R+ | 4 | 100% AI | Most natural voice but still caught |

### Topic Fingerprinting Discovery

**Critical finding**: Copyleaks' "AI Source Match" flags topics, not just writing patterns.

| Text | Author | Topic | Copyleaks Result |
|------|--------|-------|-----------------|
| Cybersecurity paragraph | Claude (hand-written) | AI + cybersecurity | 100% AI |
| Sourdough paragraph | Claude (hand-written) | Cooking | 0% AI (Human) |
| Renewable energy (raw AI) | LLM-generated | Urban planning | 100% AI |
| Renewable energy (Veil Stealth) | Llama 70B + post-process | Urban planning | **0% AI (Human)** |

Topics saturated in AI training data (cybersecurity, AI, machine learning) trigger false positives even on human-written text. Non-saturated topics work correctly.

### What Copyleaks Actually Detects

1. **AI Source Match** — compares against database of known AI-generated text
2. **AI Phrases** — specific n-grams common in AI output
3. **Perplexity** — predictability of token choices (low = AI)
4. **Burstiness** — variance in sentence complexity (low = AI)

### What Breaks Detection (our pipeline)

1. **Model diversity** — Llama 70B has different token distribution than Gemini/GPT
2. **Vocabulary perturbation** — replacing AI-predictable words with casual alternatives
3. **Contraction forcing** — humans contract, AI doesn't
4. **Burstiness injection** — splitting/merging sentences for length variety
5. **Filler words** — "look", "honestly", "basically" at strategic points
6. **Em-dash removal** — em-dashes are a major AI fingerprint
7. **AI adverb stripping** — "significantly", "substantially", "effectively"

### What Doesn't Work

1. Simple synonym substitution alone
2. High temperature (tested up to 1.5)
3. Two-pass chains (second model re-formalizes the output)
4. "Write like a student" / "explain to a friend" prompting alone
5. ANY single-model approach without post-processing

## Next Steps

- [ ] Adversarial detector feedback loop — score alternatives against GPTZero, auto-select most human
- [ ] Strip LLM preamble leak ("Here's the rewritten passage:")
- [ ] Minimum output length guard (350 chars for Copyleaks)
- [ ] Test across more topics to build confidence matrix
- [ ] Investigate Copyleaks' paid API for direct adversarial optimization
