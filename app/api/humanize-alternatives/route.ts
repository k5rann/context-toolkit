import { NextRequest, NextResponse } from "next/server";
import { generateAlternatives } from "@/lib/humanizer-alternatives";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_INPUT_CHARS = 25000;

export async function POST(req: NextRequest) {
  try {
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

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
