# Humanizer Model-Swap Copyleaks Results

Created: 2026-05-13T12:37:49.382Z

Fill `Copyleaks % AI` and `AI phrases` manually after testing each output.

| Sample | Category | Route | Model | Input words | Output words | Leak? | Copyleaks % AI | AI phrases | Notes |
|---|---|---|---|---:|---:|---|---:|---:|---|
| ai-generic-essay | generic essay | current-chain | Generator: meta-llama/llama-3.3-70b-instruct → qwen/qwen-2.5-72b-instruct | 165 | 135 | no |  |  |  |
| ai-generic-essay | generic essay | deepseek-v4 | deepseek/deepseek-v4-flash | 165 | 119 | no |  |  |  |
| ai-generic-essay | generic essay | minimax-free | minimax/minimax-m2.5:free | 165 | 146 | no |  |  |  |
| cybersecurity-explainer | cybersecurity | current-chain | Generator: meta-llama/llama-3.3-70b-instruct → qwen/qwen-2.5-72b-instruct | 152 | 140 | no |  |  |  |
| cybersecurity-explainer | cybersecurity | deepseek-v4 | deepseek/deepseek-v4-flash | 152 | 98 | no |  |  |  |
| cybersecurity-explainer | cybersecurity | minimax-free | minimax/minimax-m2.5:free | 152 | 132 | no |  |  |  |
| business-about-copy | business copy | current-chain | Generator: meta-llama/llama-3.3-70b-instruct → qwen/qwen-2.5-72b-instruct | 130 | 109 | no |  |  |  |
| business-about-copy | business copy | deepseek-v4 | deepseek/deepseek-v4-flash | 130 | 94 | no |  |  |  |
| business-about-copy | business copy | minimax-free | minimax/minimax-m2.5:free | 130 | 0 | no |  |  | ERROR: OpenRouter request timed out after 60s. Free-tier model may be slow or overloaded; try a different mode or retry in a moment. |

Pass criterion from Claude handoff: model route drops below 60% AI on at least 7 of 10 fixed samples.
