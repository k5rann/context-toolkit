import { NextRequest, NextResponse } from "next/server";
import { humanize } from "@/lib/humanizer";
import type { HumanizerTone } from "@/lib/prompts/humanizer-template";

export const runtime = "nodejs";
export const maxDuration = 60;

const VALID_TONES: HumanizerTone[] = [
  "casual",
  "professional",
  "academic",
  "storytelling",
];

const MAX_INPUT_CHARS = 25000;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { text, tone, apiKey: bodyKey } = body;

    if (!text || typeof text !== "string" || !text.trim()) {
      return NextResponse.json(
        { error: "text is required" },
        { status: 400 }
      );
    }

    if (text.length > MAX_INPUT_CHARS) {
      return NextResponse.json(
        {
          error: `Input is ${text.length.toLocaleString()} characters; max is ${MAX_INPUT_CHARS.toLocaleString()}. Trim it down or split into chunks.`,
        },
        { status: 400 }
      );
    }

    const resolvedTone: HumanizerTone = VALID_TONES.includes(tone as HumanizerTone)
      ? (tone as HumanizerTone)
      : "casual";

    const apiKey = bodyKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "No Gemini API key. Open the menu (top right) and paste your free key. Get one at https://aistudio.google.com/app/apikey",
        },
        { status: 400 }
      );
    }

    const result = await humanize({ text, tone: resolvedTone, apiKey });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isRateLimit = ["rate limit", "quota", "all free-tier"].some((t) =>
      message.toLowerCase().includes(t)
    );
    return NextResponse.json(
      { error: message, rateLimit: isRateLimit },
      { status: isRateLimit ? 429 : 500 }
    );
  }
}
