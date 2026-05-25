import { NextRequest, NextResponse } from "next/server";
import { generateAlternatives } from "@/lib/humanizer-alternatives";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_INPUT_CHARS = 25000;

// Rate-limit config. Each request fans out to ~9 LLM calls (~$0.10–0.20).
// 5 requests / 60 seconds / IP is the sweet spot between letting real users
// iterate freely and shutting down bots before they cost real money.
// Override via env vars for staging / load-testing.
const RATE_LIMIT_REQUESTS = Number(process.env.HUMANIZER_RATE_LIMIT ?? 5);
const RATE_LIMIT_WINDOW_SECONDS = Number(
  process.env.HUMANIZER_RATE_LIMIT_WINDOW ?? 60
);

export async function POST(req: NextRequest) {
  try {
    // Rate limit BEFORE parsing body / spinning up LLM calls. Bots paying
    // nothing for a rejected request is the whole point.
    const ip = getClientIp(req);
    const rl = checkRateLimit(ip, {
      limit: RATE_LIMIT_REQUESTS,
      windowSeconds: RATE_LIMIT_WINDOW_SECONDS,
    });
    if (!rl.allowed) {
      const retryAfter = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000));
      return NextResponse.json(
        {
          error: `Rate limit hit. Try again in ${retryAfter}s. Limit: ${rl.limit} requests per ${RATE_LIMIT_WINDOW_SECONDS}s per IP.`,
          rateLimited: true,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(retryAfter),
            "X-RateLimit-Limit": String(rl.limit),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(Math.floor(rl.resetAt / 1000)),
          },
        }
      );
    }

    const body = await req.json();
    const { text } = body;

    if (!text || typeof text !== "string" || !text.trim()) {
      return NextResponse.json(
        { error: "text is required" },
        { status: 400 }
      );
    }

    if (text.length > MAX_INPUT_CHARS) {
      return NextResponse.json(
        {
          error: `Input is ${text.length.toLocaleString()} characters; max is ${MAX_INPUT_CHARS.toLocaleString()}.`,
        },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY ?? "";
    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY required" },
        { status: 500 }
      );
    }

    const result = await generateAlternatives({
      text: text.trim(),
      apiKey,
    });

    return NextResponse.json(result, {
      headers: {
        "X-RateLimit-Limit": String(rl.limit),
        "X-RateLimit-Remaining": String(rl.remaining),
        "X-RateLimit-Reset": String(Math.floor(rl.resetAt / 1000)),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
