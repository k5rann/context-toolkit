# Humanizer Model-Swap Copyleaks Results

Created: 2026-05-13T11:52:42.865Z

Fill `Copyleaks % AI` and `AI phrases` manually after testing each output.

| Sample | Category | Route | Model | Input words | Output words | Leak? | Copyleaks % AI | AI phrases | Notes |
|---|---|---|---|---:|---:|---|---:|---:|---|
| ai-generic-essay | generic essay | current-chain | Generator: meta-llama/llama-3.3-70b-instruct → deepseek/deepseek-v4-flash | 165 | 166 | no |  |  |  |
| ai-generic-essay | generic essay | deepseek-free | deepseek/deepseek-v4-flash | 165 | 107 | no |  |  |  |
| ai-generic-essay | generic essay | minimax-free | minimax/minimax-m2.5:free | 165 | 150 | no |  |  |  |

Pass criterion from Claude handoff: model route drops below 60% AI on at least 7 of 10 fixed samples.
