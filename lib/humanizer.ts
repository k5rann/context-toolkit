import { generate } from "./llm";
import {
  buildRewritePrompt,
  buildAntiArcPrompt,
  buildCriticRevisePrompt,
  HumanizerTone,
  HumanizerAggression,
} from "./prompts/humanizer-template";

// v3 architecture:
//   light  → 2 passes (persona rewrite → critic)
//   medium → 2 passes (persona rewrite → critic with anti-arc rules)
//   heavy  → 3 passes (persona rewrite → anti-arc surgery → aggressive critic)
const REWRITE_MODEL = "gemini-2.5-flash";
const SURGERY_MODEL = "gemini-2.5-flash";
const CRITIC_MODEL = "gemini-2.5-flash";

export interface HumanizeOptions {
  text: string;
  tone: HumanizerTone;
  aggression?: HumanizerAggression;
  apiKey: string;
}

export interface HumanizeResult {
  output: string;
  pass1Output: string;
  pass2Output?: string;
  tone: HumanizerTone;
  aggression: HumanizerAggression;
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
  return s
    .replace(
      /^(?:here(?:'s| is)?\s+(?:the\s+)?(?:rewritten|humanized|revised|edited|revision|surgically|restructured)[^\n:]*:?\s*)/i,
      ""
    )
    .replace(/^(?:revised|restructured|surgical)(?:\s+text)?\s*:\s*/i, "")
    .replace(/^output\s*:\s*/i, "");
}

function clean(raw: string): string {
  return stripWrappingQuotes(stripPreamble(raw)).trim();
}

export async function humanize({
  text,
  tone,
  aggression = "medium",
  apiKey,
}: HumanizeOptions): Promise<HumanizeResult> {
  const trimmed = text.trim();
  const originalWordCount = wordCount(trimmed);

  // Pass 1: persona rewrite (every aggression level).
  const pass1Raw = await generate({
    apiKey,
    prompt: buildRewritePrompt(trimmed, tone),
    preferredModel: REWRITE_MODEL,
  });
  const pass1Output = clean(pass1Raw);

  // Pass 2 (heavy only): anti-arc structural surgery.
  let surgeryOutput: string | undefined;
  let inputForCritic = pass1Output;

  if (aggression === "heavy") {
    const surgeryRaw = await generate({
      apiKey,
      prompt: buildAntiArcPrompt(pass1Output, tone, originalWordCount),
      preferredModel: SURGERY_MODEL,
    });
    surgeryOutput = clean(surgeryRaw);
    inputForCritic = surgeryOutput;
  }

  // Final pass: critic + revise. Aggression tunes how aggressive the critic is.
  const criticRaw = await generate({
    apiKey,
    prompt: buildCriticRevisePrompt(
      inputForCritic,
      tone,
      originalWordCount,
      aggression
    ),
    preferredModel: CRITIC_MODEL,
  });
  const finalOutput = clean(criticRaw);

  return {
    output: finalOutput,
    pass1Output,
    pass2Output: surgeryOutput,
    tone,
    aggression,
    originalWordCount,
    outputWordCount: wordCount(finalOutput),
    passes: aggression === "heavy" ? 3 : 2,
  };
}
