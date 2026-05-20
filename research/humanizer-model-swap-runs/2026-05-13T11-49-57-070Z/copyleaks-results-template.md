# Humanizer Model-Swap Copyleaks Results

Created: 2026-05-13T11:50:56.271Z

Fill `Copyleaks % AI` and `AI phrases` manually after testing each output.

| Sample | Category | Route | Model | Input words | Output words | Leak? | Copyleaks % AI | AI phrases | Notes |
|---|---|---|---|---:|---:|---|---:|---:|---|
| ai-generic-essay | generic essay | current-chain | Generator: meta-llama/llama-3.3-70b-instruct → deepseek/deepseek-v4-flash | 165 | 126 | no |  |  |  |
| ai-generic-essay | generic essay | qwen-free | qwen/qwen3-next-80b-a3b-instruct:free | 165 | 0 | no |  |  | ERROR: OpenRouter 429: {"error":{"message":"Provider returned error","code":429,"metadata":{"raw":"qwen/qwen3-next-80b-a3b-instruct:free is temporarily rate-limited upstream. Please retry shortly, or add your own key to accumulate your rate limits: https://openrouter.ai/settings/integrations","provider_name":"Venice","is_ |
| ai-generic-essay | generic essay | deepseek-free | deepseek/deepseek-v4-flash | 165 | 113 | no |  |  |  |
| ai-generic-essay | generic essay | minimax-free | minimax/minimax-m2.5:free | 165 | 141 | no |  |  |  |
| ai-generic-essay | generic essay | qwen-deepseek-chain | qwen/qwen3-next-80b-a3b-instruct:free -> deepseek/deepseek-v4-flash | 165 | 0 | no |  |  | ERROR: OpenRouter 429: {"error":{"message":"Provider returned error","code":429,"metadata":{"raw":"qwen/qwen3-next-80b-a3b-instruct:free is temporarily rate-limited upstream. Please retry shortly, or add your own key to accumulate your rate limits: https://openrouter.ai/settings/integrations","provider_name":"Venice","is_ |
| ai-generic-essay | generic essay | deepseek-qwen-chain | deepseek/deepseek-v4-flash -> qwen/qwen3-next-80b-a3b-instruct:free | 165 | 0 | no |  |  | ERROR: OpenRouter 429: {"error":{"message":"Provider returned error","code":429,"metadata":{"raw":"qwen/qwen3-next-80b-a3b-instruct:free is temporarily rate-limited upstream. Please retry shortly, or add your own key to accumulate your rate limits: https://openrouter.ai/settings/integrations","provider_name":"Venice","is_ |

Pass criterion from Claude handoff: model route drops below 60% AI on at least 7 of 10 fixed samples.
