import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Mint a short-lived Deepgram access token so the browser can open a
// WebSocket directly without exposing the long-lived API key.
// /v1/auth/grant returns an access_token that's good for ~30s, but once
// the WS connection is established the connection persists past expiry.
export async function POST() {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Server is missing DEEPGRAM_API_KEY. Add it in Vercel env vars (or .env.local for dev).",
      },
      { status: 500 }
    );
  }

  try {
    const res = await fetch("https://api.deepgram.com/v1/auth/grant", {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    if (!res.ok) {
      const detail = await res.text();
      return NextResponse.json(
        {
          error: `Deepgram token grant failed (${res.status}). ${detail.slice(0, 200)}`,
        },
        { status: res.status }
      );
    }

    const data = (await res.json()) as {
      access_token: string;
      expires_in: number;
    };
    return NextResponse.json({
      token: data.access_token,
      expiresIn: data.expires_in,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Could not reach Deepgram: ${message}` },
      { status: 502 }
    );
  }
}
