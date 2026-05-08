// OpenRouter client. Their API is OpenAI-compatible — same /chat/completions
// shape, Bearer auth header. We use it for "experimental" model presets that
// route to non-Gemini models (DeepSeek-V3, Llama-3.3-70B, Qwen-2.5-72B) for
// the Copyleaks-evasion test: different model fingerprint = different
// per-token perplexity distribution = real shot at breaking detectors that
// pattern-match Gemini specifically.

export interface OpenRouterOptions {
  apiKey: string;
  prompt: string;
  model: string;
  temperature?: number;
}

interface OpenRouterChoice {
  message?: { content?: string };
}

interface OpenRouterResponse {
  choices?: OpenRouterChoice[];
  error?: { message?: string };
}

export async function generateOpenRouter({
  apiKey,
  prompt,
  model,
  temperature = 0.85,
}: OpenRouterOptions): Promise<string> {
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is missing. Add it in Vercel env vars (or .env.local for dev)."
    );
  }

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      // OpenRouter recommends these for analytics + leaderboard ranking.
      "HTTP-Referer": "https://context-toolkit.vercel.app",
      "X-Title": "Context Toolkit Humanizer",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    // Surface OpenRouter's own error structure when possible.
    throw new Error(
      `OpenRouter ${res.status}: ${detail.slice(0, 300)}`
    );
  }

  const data = (await res.json()) as OpenRouterResponse;
  if (data.error) {
    throw new Error(`OpenRouter error: ${data.error.message ?? "unknown"}`);
  }
  const text = data.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error("OpenRouter returned empty completion.");
  }
  return text;
}

// OpenRouter model IDs follow the "vendor/model[:variant]" pattern
// (e.g. "deepseek/deepseek-chat-v3.1:free"). Gemini model IDs are flat
// ("gemini-2.5-flash"). The "/" is the cleanest signal.
export function isOpenRouterModel(modelName: string): boolean {
  return modelName.includes("/");
}
