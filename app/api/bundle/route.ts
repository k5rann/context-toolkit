import { NextRequest, NextResponse } from "next/server";
import { bundle } from "@/lib/bundler";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userInput, extraContext, modes, cleanup, apiKey: bodyKey } = body;

    if (!userInput || typeof userInput !== "string" || !userInput.trim()) {
      return NextResponse.json(
        { error: "userInput is required" },
        { status: 400 }
      );
    }

    // Priority: user-provided key from request > shared env var
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

    const result = await bundle({
      userInput,
      extraContext: extraContext || "",
      modes: Array.isArray(modes) ? modes : [],
      cleanup: cleanup !== false,
      apiKey,
    });

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
