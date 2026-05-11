# Humanizer Alternatives Research

**Date:** 2026-05-11
**Goal:** Identify reliable AI text humanization approaches that beat all major detectors
**Detectors:** Copyleaks, GPTZero, ZeroGPT, Quillbot, Originality, Sapling
**Baseline:** MiniMax via OpenRouter free tier (proved 0% Copyleaks on product copy, but endpoint unreliable)

---

## Ranked Alternatives

### Tier 1 — Highest Evidence, Most Actionable

#### 1. Humanizer API Integration (RewriteAI / GPTHuman / Humanize AI Pro)
- **What:** REST APIs purpose-built for humanization. POST text in, get humanized text back.
- **Evidence:** Humanize AI Pro claims 97.3% bypass, 2.1s response, $0 unlimited. GPTHuman starts $19/mo. Undetectable AI $9.99/mo with 91% bypass.
- **Cost:** $0 (Humanize AI Pro) to $24/mo (WriteHybrid)
- **Integration effort:** Low — single endpoint, drop-in replacement for our MiniMax call
- **Risk:** CONFIDENTIALITY CONCERN — leadership text flows through third-party servers. Black box.
- **Verdict:** DEPRIORITIZED for confidential use. Only viable if company approves data flowing to third-party API. Consider only if in-house approaches fail.

#### 2. Multi-Model Pipeline via OpenRouter Free Tier
- **What:** Use a different-fingerprint model as the rewrite engine. Or chain: Model A drafts → Model B refines.
- **Models available free on OpenRouter (May 2026):**
  - NVIDIA Nemotron 3 Super 120B (262K ctx, MoE)
  - Google Gemma 4 31B (256K ctx, dense)
  - Z.ai GLM 4.5 Air (131K ctx, MoE)
  - OpenAI gpt-oss-120b (131K ctx)
- **Evidence:** Our own data proved model fingerprint is the wall (Gemini→100% Copyleaks, MiniMax→0%). Different models = different fingerprints.
- **Cost:** $0 (free tier)
- **Integration effort:** Medium — swap model ID in openrouter.ts, tune prompts
- **Risk:** Free tier reliability (same problem as MiniMax)
- **Verdict:** Immediate next experiment. Test Nemotron, Gemma 4, GLM against Copyleaks.

#### 3. Iterative Multi-Pass Paraphrasing (Academic Approach)
- **What:** Run text through 3-5 rounds of paraphrasing. Each round degrades detector accuracy.
- **Evidence:** arxiv 2512.05311: 5 rounds degraded detection by 25.4% avg. Simplified paraphrasing (non-expert audience) was most effective — outperformed general paraphrase by 2.98pp.
- **Cost:** 3-5x single-pass cost
- **Integration effort:** Medium — extend existing pass architecture
- **Risk:** Latency (3-5x), meaning drift
- **Verdict:** Combine with model-switching for maximum fingerprint disruption.

### Tier 2 — Moderate Evidence, Worth Investigating

#### 4. Commercial Humanizer Benchmarks (Competitive Intel)
- **Scores (GPTZero / ZeroGPT / Originality / Copyleaks):**
  - AI Busted: 3% / 0% / 7% / 4% (avg 4%)
  - WriteHuman: 6% / 1% / 8% / 5% (avg 5%)
  - Humanizer Pro: 7% / 2% / 9% / 6% (avg 6%)
  - Undetectable AI: 9% / 2% / 12% / 8% (avg 8%)
- **Source:** aibusted.com benchmark (may be biased)
- **Takeaway:** Copyleaks 4-8% is achievable. Our MiniMax hit 0%. The gap is reliability.

#### 5. NLP Encoder-Decoder Models (T5, BART, Pegasus)
- **What:** Encoder-decoder models for paraphrasing — different architecture → different fingerprint.
- **Cost:** Free (HuggingFace Inference)
- **Integration effort:** High (different API format)
- **Verdict:** Worth testing as a secondary rewrite pass.

#### 6. Simplified Rewriting Strategy
- **What:** Prompt to rewrite for non-expert audience.
- **Evidence:** Most effective single technique per academic research.
- **Cost:** $0 (prompt change only)
- **Verdict:** Easy win. Add as prompt strategy.

#### 7. Chainwash Multi-Hop Rewriting (NEW — Academic Breakthrough)
- **What:** Chain multiple LLMs, each rewriting the previous output. 1-5 hops through different models.
- **Evidence (arxiv 2605.05503):**
  - 1 rewrite → detection drops to 14-41%
  - 5 chained rewrites → detection drops to 4.86% (94.76% undetectable)
  - Tested with small models (1.5B-8B params) — NOT big models
  - 5 rewrite styles tested: paraphrase, humanize, simplify, academic, summarize-expand
  - 160,500 rewritten texts in the study
- **Cost:** 2-5x single rewrite (multiple model calls)
- **Integration effort:** Medium — chain our existing generate() function with rotating models
- **Risk:** Latency (2-5 hops), meaning drift accumulates
- **Verdict:** STRONGEST EVIDENCE of any approach. Even 2 hops with different models dramatically reduces detection. This IS the implementation strategy.

### Tier 3 — Low Evidence or High Risk

#### 8. Client-Side Regex Replacement — Already our fallback. Not a solution.
#### 9. Back-Translation Pipeline — Last resort. Meaning drift too high.

---

## Recommended Implementation Plan

**Architecture: Multi-Model Chain on OpenRouter**

Based on all research, the optimal approach for a confidential internal tool:

### Phase 1 — Free Tier (Prove Concept)
1. Add Gemma 4 31B and Nemotron 3 Super as rewrite models in openrouter.ts
2. Implement 2-hop chain: Gemma 4 (rewrite) → MiniMax (refine)
3. Add model fallback rotation: if Model A times out, try Model B
4. Test against all detectors. Target: <15% on all.
5. Rate limit budget: ~200 req/day across all free models (enough for leadership use)

### Phase 2 — Paid Models (After Proving Results)
If free tier proves concept but reliability is still an issue:
1. Use OpenRouter paid models (DeepSeek V3 ~$0.14/M tokens, Llama 3.3 70B ~$0.12/M tokens)
2. Cost estimate: ~$0.002-0.01 per rewrite (2-3 passes × ~500 tokens each)
3. At 50 rewrites/day = ~$0.10-0.50/day = $3-15/month
4. Or: add GPTHuman API as fallback for when in-house fails ($19/mo)

### Phase 3 — Production Hardening
1. Add detector API pre-flight (Sapling free tier: 2K calls/mo)
2. Auto-retry with different model combination if detection score is high
3. Honest-limits UI badge with detected score
4. Audit logging for compliance

### Model Priority for Testing
1. **Google Gemma 4 31B:free** — 7+ providers, most reliable free model
2. **NVIDIA Nemotron 3 Super 120B:free** — different architecture (MoE), different fingerprint
3. **MiniMax M2.5:free** — proven to beat Copyleaks, but unreliable
4. **Z.ai GLM 4.5 Air:free** — Chinese-origin model, likely very different fingerprint
5. **OpenAI gpt-oss-120b:free** — if available, different from all above

### Chain Strategies to Test
1. Gemma 4 → MiniMax (2 hops, 2 different fingerprints)
2. Nemotron → Gemma 4 (2 hops, both free, different architectures)
3. Gemma 4 → Nemotron → MiniMax (3 hops, per Chainwash paper, ~4.86% detection)
4. Single-model with simplified rewriting prompt (cheapest, test as baseline)

---

## Evidence Log

### Iteration 1 — Landscape Survey
- GitHub: open-source repos are mostly regex-based, no real model usage
- Commercial APIs (RewriteAI, GPTHuman): exist, designed for integration
- Academic: iterative paraphrasing degrades detection 25.4% over 5 rounds
- OpenRouter: Nemotron 120B, Gemma 4 31B, GLM 4.5 Air available free
- Key insight: detector wall is model-fingerprint-level. Switching models is the direct path.

### Iteration 2 — API Pricing + Confidentiality Gate
- Humanize AI Pro: $0/unlimited, 97.3% bypass, 2.1s response (claims — may be inflated)
- Undetectable AI: $9.99/mo, 91% bypass
- GPTHuman: $19/mo, credit-based, 50+ languages
- WriteHuman: ~$0.25/1K words
- CRITICAL: all third-party APIs violate the confidentiality requirement. Leadership text cannot flow through external humanizer services.
- Re-prioritized: in-house multi-model approach (OpenRouter) is the primary path. API integration is fallback only.
- Gemma 4 31B: frontier-level capability, 256K context, free on OpenRouter — strong rewrite candidate
- Nemotron 3 Super 120B: 262K context, MoE architecture — different fingerprint from MiniMax

### Iteration 3 — Chainwash Discovery + Implementation Plan
- BREAKTHROUGH: arxiv 2605.05503 "Chainwash" paper proves multi-hop rewriting across different LLMs drops detection to 4.86% after 5 hops
- Even 1 hop = 14-41% detection (vs 100% baseline). 2 hops should get us below 15%.
- Small models (1.5-8B) were sufficient — we have access to 31B-120B models for free
- OpenRouter free tier: 20 req/min, 200 req/day — sufficient for leadership use (10-20 rewrites/day × 2-3 hops = 20-60 requests)
- Gemma 4 free has 7-11 providers (much more reliable than MiniMax's single provider)
- Built full implementation plan: Phase 1 (free, prove concept) → Phase 2 (paid, reliability) → Phase 3 (production hardening)
- Final metric: 9 ranked alternatives documented, with clear implementation path
