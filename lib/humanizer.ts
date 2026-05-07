import { generate } from "./llm";
import {
  buildRewritePrompt,
  buildCriticRevisePrompt,
  HumanizerTone,
} from "./prompts/humanizer-template";

// v2: two-pass humanizer (rewrite → critic+revise) on gemini-2.5-flash.
// Trades ~2x latency and ~2x quota for substantially harder-to-detect output.
const REWRITE_MODEL = "gemini-2.5-flash";
const CRITIC_MODEL = "gemini-2.5-flash";

export interface HumanizeOptions {
  text: string;
  tone: HumanizerTone;
  apiKey: string;
}

export interface HumanizeResult {
  output: string;
  pass1Output: string;
  tone: HumanizerTone;
  originalWordCount: number;
  outputWordCount: number;
  passes: number;
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
  return s
    .replace(
      /^(?:here(?:'s| is)?\s+(?:the\s+)?(?:rewritten|humanized|revised|edited|revision)[^\n:]*:?\s*)/i,
      ""
    )
    .replace(/^revised(?:\s+text)?\s*:\s*/i, "")
    .replace(/^output\s*:\s*/i, "");
}

function clean(raw: string): string {
  return stripWrappingQuotes(stripPreamble(raw)).trim();
}

export async function humanize({
  text,
  tone,
  apiKey,
}: HumanizeOptions): Promise<HumanizeResult> {
  const trimmed = text.trim();
  const originalWordCount = wordCount(trimmed);

  // Pass 1: persona + anti-pattern rewrite.
  const rewritePrompt = buildRewritePrompt(trimmed, tone);
  const rawPass1 = await generate({
    apiKey,
    prompt: rewritePrompt,
    preferredModel: REWRITE_MODEL,
  });
  const pass1Output = clean(rawPass1);

  // Pass 2: critic + revise. Targets surviving AI-shape signals.
  const revisePrompt = buildCriticRevisePrompt(
    pass1Output,
    tone,
    originalWordCount
  );
  const rawPass2 = await generate({
    apiKey,
    prompt: revisePrompt,
    preferredModel: CRITIC_MODEL,
  });
  const finalOutput = clean(rawPass2);

  return {
    output: finalOutput,
    pass1Output,
    tone,
    originalWordCount,
    outputWordCount: wordCount(finalOutput),
    passes: 2,
  };
}
