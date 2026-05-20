# Humanizer Model-Swap Protocol

Date started: 2026-05-13

## Goal

Find whether changing the model fingerprint can move Copyleaks more than prompt expansion did.

This is research only. Do not change the production Humanizer default until a route passes the fixed-corpus threshold.

## Fixed corpus

Use `research/humanizer-model-swap-corpus.json`.

The corpus has 10 hard samples:

1. `ai-generic-essay`
2. `cybersecurity-explainer`
3. `business-about-copy`
4. `travel-dubai-guide`
5. `academic-social-media`
6. `student-productivity-reflection`
7. `healthcare-ai`
8. `finance-risk`
9. `product-smart-bottle`
10. `opinion-remote-work`

Do not add or remove samples mid-test. That would make the comparison cherry-picked.

## Routes

Run the harness with:

```bash
npm run research:humanizer-models -- --dry-run
npm run research:humanizer-models -- --check-models
npm run research:humanizer-models -- --run --sample ai-generic-essay --routes current-chain,deepseek-v4,minimax-free
```

For the full test:

```bash
npm run research:humanizer-models -- --run --limit 10 --routes current-chain,deepseek-v4,minimax-free,openrouter-free
```

Qwen routes are included in the runner, but on 2026-05-13 they returned upstream `429` from OpenRouter's Venice provider. Retry later before using Qwen in the full corpus.

## Manual Copyleaks workflow

Each run writes a folder under:

```text
research/humanizer-model-swap-runs/
```

Inside the folder:

- `outputs.json` has every generated output.
- `copyleaks-results-template.md` is the table to fill manually.
- `copyleaks-results.tsv` is spreadsheet-friendly.
- Each `sample__route.txt` file can be pasted directly into Copyleaks.

For each non-empty output:

1. Paste into Copyleaks at sensitivity `2/3`.
2. Record `% AI`.
3. Record AI phrase count.
4. Record any factual drift or ugly prose.

## Pass criterion

A route is worth considering only if it gets below `60% AI` on at least `7/10` fixed samples.

Do not promote a route based on one good sample.

## Quality gates

Detector score alone is not enough.

Also reject outputs that:

- Add unsupported facts, timelines, studies, claims, or guarantees.
- Leak prompt/process text.
- Become visibly broken or embarrassing.
- Compress the source so aggressively that meaning is lost.

## First scout run

Run folder:

```text
research/humanizer-model-swap-runs/2026-05-13T11-52-05-190Z
```

Routes completed on `ai-generic-essay`:

| Route | Output words | Leak flag | Notes |
|---|---:|---|---|
| `current-chain` | 166 | no | Added unsupported `10-20 years` claim; watch factual drift. |
| `deepseek-free` / now `deepseek-v4` | 107 | no | Clean but compressed and still generic. Actual model: `deepseek/deepseek-v4-flash`, not marked free. |
| `minimax-free` | 150 | no | Cleanest prose of the three on manual read. |

Routes blocked:

| Route | Reason |
|---|---|
| `qwen-free` | OpenRouter upstream `429` |
| `qwen-deepseek-chain` | OpenRouter upstream `429` on Qwen hop |
| `deepseek-qwen-chain` | OpenRouter upstream `429` on Qwen hop |

Next manual action: paste the three completed outputs from the scout run into Copyleaks and fill the table before running the full 10-sample corpus.
