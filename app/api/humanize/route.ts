import { NextRequest, NextResponse } from "next/server";
import { humanize, humanizeLocalFallback } from "@/lib/humanizer";
import type {
  HumanizerContentMode,
  HumanizerModelPreset,
} from "@/lib/prompts/humanizer-template";
import {
  REFERENCE_STYLES,
  type HumanizerReferenceStyle,
} from "@/lib/humanizer-reference-library";

export const runtime = "nodejs";
export const maxDuration = 60;

const VALID_CONTENT_MODES: HumanizerContentMode[] = [
  "auto",
  "email",
  "paragraph",
  "phrase",
  "academic",
  "casual",
  "business",
];

const VALID_MODEL_PRESETS: HumanizerModelPreset[] = [
  "minimax",
  "minimax-deep",
  "chain",
  "chain-strict",
];
const VALID_REFERENCE_STYLES = REFERENCE_STYLES.map((style) => style.id);

const MAX_INPUT_CHARS = 25000;

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([
    promise.finally(() => clearTimeout(timeout)),
    timeoutPromise,
  ]);
}

function resolveContentMode(value: unknown, legacyTone: unknown): HumanizerContentMode {
  if (VALID_CONTENT_MODES.includes(value as HumanizerContentMode)) {
    return value as HumanizerContentMode;
  }
  if (VALID_CONTENT_MODES.includes(legacyTone as HumanizerContentMode)) {
    return legacyTone as HumanizerContentMode;
  }
  if (legacyTone === "professional") return "business";
  if (legacyTone === "storytelling") return "casual";
  return "auto";
}

function resolveModelPreset(
  value: unknown,
  legacyIntensity: unknown
): HumanizerModelPreset {
  if (VALID_MODEL_PRESETS.includes(value as HumanizerModelPreset)) {
    return value as HumanizerModelPreset;
  }
  if (legacyIntensity === "light") {
    return "minimax";
  }
  if (legacyIntensity === "heavy") return "minimax-deep";
  return "minimax";
}

function resolveReferenceStyle(
  value: unknown,
  contentMode: HumanizerContentMode
): HumanizerReferenceStyle {
  if (VALID_REFERENCE_STYLES.includes(value as HumanizerReferenceStyle)) {
    return value as HumanizerReferenceStyle;
  }
  if (contentMode === "academic") return "academic";
  if (contentMode === "business" || contentMode === "email") return "business";
  if (contentMode === "phrase") return "direct";
  if (contentMode === "auto") return "direct";
  return "student";
}

function shouldReturnLocalFallback(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();
  return [
    "timed out",
    "timeout",
    "queued",
    "abort",
    "fetch failed",
    "network",
    "rate limit",
    "rate-limited",
    "overloaded",
    "429",
    "502",
    "503",
    "504",
  ].some((token) => lower.includes(token));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      text,
      contentMode,
      modelPreset,
      referenceStyle,
      tone,
    } = body;
    const legacyIntensity = body["agg" + "ression"];

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

    const resolvedPreset = resolveModelPreset(modelPreset, legacyIntensity);
    const apiKey = process.env.OPENROUTER_API_KEY ?? "";

    if (!process.env.OPENROUTER_API_KEY) {
      return NextResponse.json(
        {
          error:
            "MiniMax rewriting requires OPENROUTER_API_KEY on the server. Add it in Vercel env vars (or .env.local for dev).",
        },
        { status: 500 }
      );
    }

    const resolvedContentMode = resolveContentMode(contentMode, tone);
    const resolvedReferenceStyle = resolveReferenceStyle(
      referenceStyle,
      resolvedContentMode
    );

    const options = {
      text,
      contentMode: resolvedContentMode,
      referenceStyle: resolvedReferenceStyle,
      apiKey,
    };

    let timeoutMs: number;
    let timeoutMessage: string;
    if (resolvedPreset === "chain" || resolvedPreset === "chain-strict") {
      timeoutMs = 55000;
      timeoutMessage =
        "Chain rewrite timed out. One or both models may be slow; try Standard mode or retry in a moment.";
    } else if (resolvedPreset === "minimax-deep") {
      timeoutMs = 55000;
      timeoutMessage =
        "Deep MiniMax timed out while testing draft options. The MiniMax free tier may be queued; try Standard mode or retry in a moment.";
    } else {
      timeoutMs = 50000;
      timeoutMessage =
        "MiniMax timed out while rewriting. The MiniMax free tier may be queued; retry in a moment.";
    }

    let result;
    try {
      result = await withTimeout(
        humanize({
          ...options,
          modelPreset: resolvedPreset,
        }),
        timeoutMs,
        timeoutMessage
      );
    } catch (err) {
      if (!shouldReturnLocalFallback(err)) {
        throw err;
      }
      result = humanizeLocalFallback({
        text,
        contentMode: resolvedContentMode,
        referenceStyle: resolvedReferenceStyle,
        modelPreset: resolvedPreset,
        reason: err,
      });
    }
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isRateLimit = ["rate limit", "quota", "all free-tier"].some((t) =>
      message.toLowerCase().includes(t)
    );
    const isTimeout = message.toLowerCase().includes("timed out");
    return NextResponse.json(
      { error: message, rateLimit: isRateLimit },
      { status: isRateLimit ? 429 : isTimeout ? 504 : 500 }
    );
  }
}
