// OpenRouter client. Their API is OpenAI-compatible: same /chat/completions
// shape and Bearer auth header. The Humanizer uses this server-side path for
// MiniMax so the deployed app does not need the user's Gemini key.

export interface OpenRouterOptions {
  apiKey: string;
  prompt: string;
  model: string;
  temperature?: number;
  timeoutMs?: number;
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
  timeoutMs = 30000,
}: OpenRouterOptions): Promise<string> {
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is missing. Add it in Vercel env vars (or .env.local for dev)."
    );
  }

  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout>;

  // The timeout must cover the FULL lifecycle — connection, headers, AND body.
  // Previously clearTimeout fired after fetch() resolved (headers received),
  // leaving res.json() unprotected. MiniMax sends headers quickly then streams
  // reasoning tokens for 30-50s, so the old inner timeout never fired.
  async function doRequest(): Promise<string> {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
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

  try {
    return await Promise.race([
      doRequest(),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          controller.abort();
          reject(
            new Error(
              `OpenRouter request timed out after ${Math.round(timeoutMs / 1000)}s. Free-tier model may be slow or overloaded; try a different mode or retry in a moment.`
            )
          );
        }, timeoutMs);
      }),
    ]);
  } catch (err) {
    // Re-throw errors that already have a clear message from doRequest()
    // (e.g. "OpenRouter 429: ..." or "OpenRouter error: ...") or from
    // the timeout race (e.g. "timed out after Xs").
    if (err instanceof Error) {
      const msg = err.message;
      if (
        msg.includes("timed out") ||
        msg.startsWith("OpenRouter ") ||
        err.name === "AbortError"
      ) {
        // AbortError → wrap with timeout message for consistency
        if (err.name === "AbortError") {
          throw new Error(
            `OpenRouter request timed out after ${Math.round(timeoutMs / 1000)}s. Free-tier model may be slow or overloaded; try a different mode or retry in a moment.`
          );
        }
        throw err;
      }
    }
    // Connection / network failures that never reached OpenRouter
    const cause =
      err instanceof Error && "cause" in err
        ? (err as Error & { cause?: unknown }).cause
        : undefined;
    const detail =
      cause instanceof Error
        ? cause.message
        : err instanceof Error
          ? err.message
          : String(err);
    throw new Error(
      `OpenRouter request failed (network): ${detail}. Check server network access and OPENROUTER_API_KEY.`
    );
  } finally {
    clearTimeout(timeoutId!);
  }
}

// OpenRouter model IDs follow the "vendor/model[:variant]" pattern
// (e.g. "deepseek/deepseek-chat-v3.1:free"). Gemini model IDs are flat
// ("gemini-2.5-flash"). The "/" is the cleanest signal.
export function isOpenRouterModel(modelName: string): boolean {
  return modelName.includes("/");
}
