# AI-detection options for backtesting Veil

State of the world as of 2026-05-13. Most public detectors are now gated. Here's what's left.

## Free / no-API-key

| Tool | Quality | Setup | Notes |
|------|---------|-------|-------|
| **Local heuristic** (`/api/detect`) | Low | None — built-in | Simple stats (sentence-length CV, filler density, hedge density). Directional signal only. Already wired to backtest script. |
| **Stealthwriter own V1 scanner** | Medium (their own) | Free in their dashboard | Circular — biased toward passing their own humanizer. Not trustworthy as benchmark. |

## Local, open-source (best for unlimited backtesting)

Pick one and install. All run on CPU.

| Repo | Approach | Setup |
|------|----------|-------|
| [`ahans30/Binoculars`](https://github.com/ahans30/Binoculars) | Compare perplexity between two LMs (FALCON-7B + FALCON-7B-instruct). Strong, paper-quality detector. | Python + transformers + ~14GB models. Best signal we can self-host. |
| [`Xenova/transformers.js`](https://github.com/xenova/transformers.js) + [`Hello-SimpleAI/chatgpt-detector-roberta`](https://huggingface.co/Hello-SimpleAI/chatgpt-detector-roberta) | RoBERTa classifier fine-tuned on ChatGPT outputs | Node-native (no Python). `npm install @xenova/transformers`. ~500MB model. |
| [`SuperAnnotate/ai-detector`](https://github.com/SuperAnnotate/ai-detector) | Ensemble of small classifiers | Python, lightweight |
| [`mage-detector`](https://github.com/yafuly/mage-detection) | Adversarial training paper code | Python, research-grade |

**Recommendation:** Xenova + ChatGPT-detector-RoBERTa is the lowest-friction path. Node-native, one `npm install`, gives RoBERTa-classifier scores in ~200ms per paragraph on CPU.

## Paid options (when ready to validate before shipping)

| Tool | Pricing | Notes |
|------|---------|-------|
| Copyleaks | ~$10 / 100 credits | Industry standard. The benchmark customers care about. Save credits for final validation, not iteration. |
| Originality.ai | $0.01 / 100 words | Cheaper than Copyleaks for high-volume |
| GPTZero API | Free tier 10k words/month with sign-up | Solid signal, generous free tier |
| Sapling | API tier ~$25/mo | Decent quality, less brand recognition |

## How to use during Veil development

1. **Daily iteration** — local heuristic. Free, instant, runs in `npm run backtest:humanizer`. Look for direction, not absolute scores.
2. **Phrase-pattern A/B** — install Xenova + RoBERTa detector locally. Unlimited free scans, real model signal.
3. **Pre-ship validation** — pay for Copyleaks credits and run the full 10-sample × 3-mode matrix. Only spend credits once you think the humanizer is good.
4. **Production user-facing detector** — wire to GPTZero API (free tier 10k words/month is enough for most personal use). Users get a real score in the right panel.

## Why this matters

Stealthwriter's V1 scanner reports 0% AI on its own output. Of course it does — same training data. The real test is whether output beats *different* detectors than the one it was tuned against. We tune Veil against open-source detectors, validate on Copyleaks before shipping.
