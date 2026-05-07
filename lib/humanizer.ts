import { generate } from "./llm";
import {
  buildHumanizerPrompt,
  HumanizerTone,
} from "./prompts/humanizer-template";

export interface HumanizeOptions {
  text: string;
  tone: HumanizerTone;
  apiKey: string;
}

export interface HumanizeResult {
  output: string;
  tone: HumanizerTone;
  originalWordCount: number;
  outputWordCount: number;
}

function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

function stripWrappingQuotes(s: string): string {
  const t = s.trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'")) ||
    (t.startsWith("“") && t.endsWith("”"))
  ) {
    return t.slice(1, -1).trim();
  }
  return t;
}

function stripPreamble(s: string): string {
  // Models occasionally prefix with "Here is the rewritten version:" despite the rules.
  return s.replace(
    /^(?:here(?:'s| is)?\s+(?:the\s+)?(?:rewritten|humanized|revised|edited)[^\n:]*:?\s*)/i,
    ""
  );
}

export async function humanize({
  text,
  tone,
  apiKey,
}: HumanizeOptions): Promise<HumanizeResult> {
  const prompt = buildHumanizerPrompt(text.trim(), tone);
  const raw = await generate({ apiKey, prompt });
  const cleaned = stripWrappingQuotes(stripPreamble(raw)).trim();

  return {
    output: cleaned,
    tone,
    originalWordCount: wordCount(text),
    outputWordCount: wordCount(cleaned),
  };
}
