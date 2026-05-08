import { NextRequest, NextResponse } from "next/server";
import { humanize, humanizeBakeoff } from "@/lib/humanizer";
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
  "email",
  "paragraph",
  "phrase",
  "academic",
  "casual",
  "business",
];

const VALID_MODEL_PRESETS: HumanizerModelPreset[] = [
  "fast",
  "balanced",
  "quality",
  "experimental-deepseek",
  "experimental-llama",
  "experimental-qwen",
];

const EXPERIMENTAL_PRESETS: HumanizerModelPreset[] = [
  "experimental-deepseek",
  "experimental-llama",
  "experimental-qwen",
];

function isExperimentalPreset(preset: HumanizerModelPreset): boolean {
  return EXPERIMENTAL_PRESETS.includes(preset);
}
const VALID_REFERENCE_STYLES = REFERENCE_STYLES.map((style) => style.id);

const MAX_INPUT_CHARS = 25000;
const MAX_SAMPLE_CHARS = 8000;
const MAX_SOURCE_CHARS = 8000;

function resolveContentMode(value: unknown, legacyTone: unknown): HumanizerContentMode {
  if (VALID_CONTENT_MODES.includes(value as HumanizerContentMode)) {
    return value as HumanizerContentMode;
  }
  if (VALID_CONTENT_MODES.includes(legacyTone as HumanizerContentMode)) {
    return legacyTone as HumanizerContentMode;
  }
  if (legacyTone === "professional") return "business";
  if (legacyTone === "storytelling") return "casual";
  return "casual";
}

function resolveModelPreset(
  value: unknown,
  legacyIntensity: unknown
): HumanizerModelPreset {
  if (VALID_MODEL_PRESETS.includes(value as HumanizerModelPreset)) {
    return value as HumanizerModelPreset;
  }
  if (legacyIntensity === "light") return "fast";
  if (legacyIntensity === "heavy") return "quality";
  return "balanced";
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
  return "student";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      text,
      contentMode,
      modelPreset,
      referenceStyle,
      writingSample,
      sourceNotes,
      bakeoff,
      tone,
      apiKey: bodyKey,
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

    const sample =
      typeof writingSample === "string" ? writingSample.trim() : "";
    if (sample.length > MAX_SAMPLE_CHARS) {
      return NextResponse.json(
        {
          error: `Writing sample is ${sample.length.toLocaleString()} characters; max is ${MAX_SAMPLE_CHARS.toLocaleString()}. Use a shorter sample.`,
        },
        { status: 400 }
      );
    }

    const notes = typeof sourceNotes === "string" ? sourceNotes.trim() : "";
    if (notes.length > MAX_SOURCE_CHARS) {
      return NextResponse.json(
        {
          error: `Source notes are ${notes.length.toLocaleString()} characters; max is ${MAX_SOURCE_CHARS.toLocaleString()}. Use shorter notes.`,
        },
        { status: 400 }
      );
    }

    const resolvedPreset = resolveModelPreset(modelPreset, legacyIntensity);
    const usingExperimental = !bakeoff && isExperimentalPreset(resolvedPreset);

    // Experimental presets route through OpenRouter using the server-side
    // OPENROUTER_API_KEY (set in Vercel env). They don't need the user's
    // Gemini BYO key — pass a placeholder; lib/llm.ts ignores it for those.
    const apiKey = usingExperimental
      ? process.env.OPENROUTER_API_KEY ?? "openrouter-server-key"
      : bodyKey || process.env.GEMINI_API_KEY;

    if (usingExperimental && !process.env.OPENROUTER_API_KEY) {
      return NextResponse.json(
        {
          error:
            "Experimental models require OPENROUTER_API_KEY on the server. Add it in Vercel env vars (or .env.local for dev).",
        },
        { status: 500 }
      );
    }

    if (!usingExperimental && !apiKey) {
      return NextResponse.json(
        {
          error:
            "No Gemini API key. Open the menu (top right) and paste your free key. Get one at https://aistudio.google.com/app/apikey",
        },
        { status: 400 }
      );
    }

    const resolvedContentMode = resolveContentMode(contentMode, tone);

    const options = {
      text,
      contentMode: resolvedContentMode,
      referenceStyle: resolveReferenceStyle(referenceStyle, resolvedContentMode),
      writingSample: sample,
      sourceNotes: notes,
      apiKey,
    };

    const result = bakeoff
      ? await humanizeBakeoff(options)
      : await humanize({
          ...options,
          modelPreset: resolvedPreset,
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
