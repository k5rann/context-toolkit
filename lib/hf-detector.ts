// HuggingFace Inference API client for AI-text detection.
// Used as the surrogate "detector" in adversarial-paraphrasing mode —
// generate N candidates, score each, pick the lowest-AI-probability one.
//
// We use Hello-SimpleAI/chatgpt-detector-roberta (a fine-tuned RoBERTa
// classifier) as the surrogate. Detector signals transfer reasonably
// well across detectors, so beating this should help against Copyleaks.
// Caveat: surrogate ≠ Copyleaks; not guaranteed.

const DEFAULT_MODEL = "Hello-SimpleAI/chatgpt-detector-roberta";

export interface DetectorScore {
  aiProbability: number; // 0-1, higher = more AI-shaped
  humanProbability: number; // 0-1
  rawLabels: Array<{ label: string; score: number }>;
  model: string;
  textLength: number;
}

interface HFLabelScore {
  label: string;
  score: number;
}

interface HFErrorResponse {
  error?: string;
  estimated_time?: number;
}

// HF inference returns either:
//   [[ {label, score}, ... ]]  (nested array per input)
//   [ {label, score}, ... ]    (flat for single input)
type HFInferenceResponse = HFLabelScore[] | HFLabelScore[][] | HFErrorResponse;

function flattenLabels(raw: HFInferenceResponse): HFLabelScore[] {
  if (Array.isArray(raw)) {
    if (raw.length === 0) return [];
    const first = raw[0];
    if (Array.isArray(first)) {
      return first as HFLabelScore[];
    }
    return raw as HFLabelScore[];
  }
  return [];
}

function aiProbabilityFromLabels(labels: HFLabelScore[]): number {
  // Different detector models use different label conventions.
  // Be defensive: try multiple naming patterns to find the AI-class score.
  const aiLabelPatterns = [
    /^chatgpt$/i,
    /^ai$/i,
    /^ai[-_ ]?generated$/i,
    /^machine$/i,
    /^fake$/i,
    /label_1$/i, // some models use generic LABEL_1 for positive class
  ];
  const humanLabelPatterns = [/^human$/i, /^real$/i, /^label_0$/i];

  for (const label of labels) {
    if (aiLabelPatterns.some((re) => re.test(label.label))) {
      return label.score;
    }
  }
  // If we only found a "human" score, AI = 1 - human.
  for (const label of labels) {
    if (humanLabelPatterns.some((re) => re.test(label.label))) {
      return 1 - label.score;
    }
  }
  // Fallback: assume index 1 is the positive (AI) class — common convention.
  return labels[1]?.score ?? 0.5;
}

function humanProbabilityFromLabels(labels: HFLabelScore[]): number {
  const humanLabelPatterns = [/^human$/i, /^real$/i, /^label_0$/i];
  for (const label of labels) {
    if (humanLabelPatterns.some((re) => re.test(label.label))) {
      return label.score;
    }
  }
  return 1 - aiProbabilityFromLabels(labels);
}

export interface ScoreOptions {
  text: string;
  apiKey: string;
  model?: string;
  // First call to a cold model returns 503 with `estimated_time`. We retry
  // up to this many times (with the suggested wait) before giving up.
  maxRetries?: number;
}

export async function scoreWithDetector({
  text,
  apiKey,
  model = DEFAULT_MODEL,
  maxRetries = 2,
}: ScoreOptions): Promise<DetectorScore> {
  if (!apiKey) {
    throw new Error("HUGGINGFACE_API_KEY is missing.");
  }

  // Truncate to a safe length — RoBERTa classifiers cap at 512 tokens (~2000 chars).
  // Most marketing/blog inputs are well under that, but trim defensively.
  const trimmed = text.slice(0, 1800);

  const url = `https://api-inference.huggingface.co/models/${model}`;
  let lastErr: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: trimmed,
        // wait_for_model=true keeps the request open while a cold model
        // loads instead of returning 503. Saves us a retry round trip.
        options: { wait_for_model: true },
      }),
    });

    if (res.status === 503) {
      // Cold-start: server is loading the model. Body has estimated_time.
      const body = (await res.json().catch(() => ({}))) as HFErrorResponse;
      const wait = Math.min(15, body.estimated_time ?? 5);
      lastErr = new Error(
        `HuggingFace model loading (estimated ${wait}s). Retry ${attempt + 1}/${maxRetries + 1}.`
      );
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, wait * 1000));
        continue;
      }
      throw lastErr;
    }

    if (!res.ok) {
      const detail = await res.text();
      throw new Error(
        `HuggingFace ${res.status}: ${detail.slice(0, 200)}`
      );
    }

    const raw = (await res.json()) as HFInferenceResponse;
    if ("error" in raw && raw.error) {
      throw new Error(`HuggingFace error: ${raw.error}`);
    }

    const labels = flattenLabels(raw);
    if (labels.length === 0) {
      throw new Error("HuggingFace returned an unexpected response shape.");
    }

    return {
      aiProbability: aiProbabilityFromLabels(labels),
      humanProbability: humanProbabilityFromLabels(labels),
      rawLabels: labels,
      model,
      textLength: trimmed.length,
    };
  }

  throw lastErr ?? new Error("Detector scoring failed for unknown reasons.");
}
