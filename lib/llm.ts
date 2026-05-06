import { GoogleGenerativeAI } from "@google/generative-ai";

// Free-tier model fallback chain. Order = preference.
// Each model has its own daily/per-minute quota bucket.
const GEMINI_FALLBACK_CHAIN = [
  "gemini-2.5-flash-lite",
  "gemini-flash-lite-latest",
  "gemini-flash-latest",
  "gemini-2.5-flash",
  "gemini-2.0-flash-lite",
  "gemini-2.0-flash",
];

function isRateLimitError(err: unknown): boolean {
  const s = String(err).toLowerCase();
  return ["429", "resource_exhausted", "quota", "rate limit"].some((t) =>
    s.includes(t)
  );
}

export interface GenerateOptions {
  apiKey: string;
  prompt: string;
  preferredModel?: string;
}

export async function generate({
  apiKey,
  prompt,
  preferredModel,
}: GenerateOptions): Promise<string> {
  if (!apiKey) {
    throw new Error(
      "No Gemini API key provided. Get one free at https://aistudio.google.com/app/apikey"
    );
  }

  const primary = preferredModel || "gemini-2.5-flash-lite";
  const chain = [primary, ...GEMINI_FALLBACK_CHAIN.filter((m) => m !== primary)];

  const genAI = new GoogleGenerativeAI(apiKey);
  const rateLimited: string[] = [];
  let lastErr: unknown = null;

  for (const modelName of chain) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (err) {
      if (isRateLimitError(err)) {
        rateLimited.push(modelName);
        lastErr = err;
        continue;
      }
      throw err;
    }
  }

  throw new Error(
    `All free-tier Gemini models hit rate limits.\nTried: ${rateLimited.join(", ")}\nDaily quotas reset at midnight Pacific time.`
  );
}
