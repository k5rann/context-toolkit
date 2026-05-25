/**
 * In-memory IP-based rate limiter.
 *
 * Why: each humanize-alternatives request fans out to ~9 LLM calls
 * (5 Llama variants + 1 DeepSeek hop-2 + 3 per-sentence Gemini per
 * sentence). At OpenRouter rates that's ~$0.10–0.20 per request.
 * Without a limiter, a bot or accidental loop could rack up thousands
 * of dollars overnight.
 *
 * Trade-offs of in-memory:
 *   - Resets on every Vercel function cold-start (each isolated)
 *   - Doesn't share state across regions
 *   - Good enough for a launch-and-monitor MVP
 *
 * If abuse appears in production: swap for Upstash Redis (drop-in API)
 * or Vercel KV. Both are ~5 min wiring jobs.
 */

interface Bucket {
  /** Unix-ms timestamps of requests in the current window */
  hits: number[];
}

/** Map of identifier (IP) → bucket */
const BUCKETS = new Map<string, Bucket>();

/** Sweep buckets older than 1 hour every 5 minutes to prevent unbounded growth */
let lastSweep = Date.now();
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const BUCKET_TTL_MS = 60 * 60 * 1000;

function sweepStale(now: number): void {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, bucket] of BUCKETS) {
    if (bucket.hits.length === 0) {
      BUCKETS.delete(key);
      continue;
    }
    const newest = bucket.hits[bucket.hits.length - 1];
    if (now - newest > BUCKET_TTL_MS) {
      BUCKETS.delete(key);
    }
  }
}

export interface RateLimitResult {
  /** True if the request is allowed */
  allowed: boolean;
  /** Requests left in the current window */
  remaining: number;
  /** Unix-ms timestamp when the window resets */
  resetAt: number;
  /** Configured max requests per window */
  limit: number;
}

export interface RateLimitOptions {
  /** Max requests allowed in the window */
  limit: number;
  /** Window length in seconds */
  windowSeconds: number;
}

/**
 * Check (and increment) rate limit for an identifier. Returns whether the
 * request is allowed plus metadata for response headers.
 */
export function checkRateLimit(
  identifier: string,
  { limit, windowSeconds }: RateLimitOptions
): RateLimitResult {
  const now = Date.now();
  sweepStale(now);

  const windowMs = windowSeconds * 1000;
  const cutoff = now - windowMs;

  const bucket = BUCKETS.get(identifier) ?? { hits: [] };
  // Drop hits outside the window
  bucket.hits = bucket.hits.filter((t) => t > cutoff);

  if (bucket.hits.length >= limit) {
    BUCKETS.set(identifier, bucket);
    const oldest = bucket.hits[0];
    return {
      allowed: false,
      remaining: 0,
      resetAt: oldest + windowMs,
      limit,
    };
  }

  bucket.hits.push(now);
  BUCKETS.set(identifier, bucket);
  return {
    allowed: true,
    remaining: limit - bucket.hits.length,
    resetAt: now + windowMs,
    limit,
  };
}

/**
 * Extract the client IP from a Next.js request. Tries x-forwarded-for first
 * (Vercel's standard header), then x-real-ip, then falls back to a static
 * "unknown" bucket (which still rate-limits but bunches all anonymous
 * requests together — better than no limit).
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    // x-forwarded-for can be a comma-separated chain — take the first
    return forwarded.split(",")[0].trim();
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}
