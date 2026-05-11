import { GoogleGenerativeAI } from "@google/generative-ai";
import { generateOpenRouter, isOpenRouterModel } from "./openrouter";

// Free-tier Gemini fallback chain. Order = preference.
// Each model has its own daily/per-minute quota bucket.
const GEMINI_FALLBACK_CHAIN = [
  "gemini-2.5-flash-lite",
  "gemini-flash-lite-latest",
  "gemini-flash-latest",
  "gemini-2.5-flash",
  "gemini-2.0-flash-lite",
  "gemini-2.0-flash",
];

// Triggers a fallback to the next model in the chain. Covers:
//   - 429 / quota / rate limit (per-model daily or per-minute limits)
//   - 503 / service unavailable / overloaded / high demand (upstream load)
//   - 500 / 502 / 504 (transient upstream errors)
function shouldFallback(err: unknown): boolean {
  const s = String(err).toLowerCase();
  return [
    "429",
    "resource_exhausted",
    "quota",
    "rate limit",
    "503",
    "service unavailable",
    "overloaded",
    "high demand",
    "500",
    "502",
    "504",
    "unavailable",
  ].some((t) => s.includes(t));
}

export interface GenerateOptions {
  apiKey: string;
  prompt: string;
  preferredModel?: string;
  temperature?: number;
  timeoutMs?: number;
}

export async function generate({
  apiKey,
  prompt,
  preferredModel,
  temperature,
  timeoutMs,
}: GenerateOptions): Promise<string> {
  // Route OpenRouter models (vendor/model format) to the OpenRouter client
  // using the server-side OPENROUTER_API_KEY. The user's BYO Gemini key
  // doesn't apply here — OpenRouter is a separate vendor.
  if (preferredModel && isOpenRouterModel(preferredModel)) {
    const orKey = process.env.OPENROUTER_API_KEY;
    if (!orKey) {
      throw new Error(
        "OPENROUTER_API_KEY is missing on the server. MiniMax rewriting requires it. Add it in Vercel env vars."
      );
    }
    return generateOpenRouter({
      apiKey: orKey,
      prompt,
      model: preferredModel,
      temperature,
      timeoutMs,
    });
  }

  // Default: Gemini path with the BYO/env key + fallback chain.
  if (!apiKey) {
    throw new Error(
      "No Gemini API key provided. Get one free at https://aistudio.google.com/app/apikey"
    );
  }

  const primary = preferredModel || "gemini-2.5-flash-lite";
  const chain = [primary, ...GEMINI_FALLBACK_CHAIN.filter((m) => m !== primary)];

  const genAI = new GoogleGenerativeAI(apiKey);
  const skipped: string[] = [];
  let lastErr: unknown = null;

  for (const modelName of chain) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (err) {
      if (shouldFallback(err)) {
        skipped.push(modelName);
        lastErr = err;
        continue;
      }
      throw err;
    }
  }

  const lastMessage =
    lastErr instanceof Error ? lastErr.message : String(lastErr);
  throw new Error(
    `All free-tier Gemini models unavailable (rate-limited or overloaded).\nTried: ${skipped.join(", ")}\nLast error: ${lastMessage}\nQuotas reset at midnight Pacific time. Overload usually clears in a few minutes.`
  );
}
