# Stealthwriter Reconnaissance — 2026-05-14

## Architecture

| Layer | Detail |
|-------|--------|
| Framework | Next.js App Router (Turbopack) |
| Host | Vercel (deploy `dpl_9usrpdNRf3Qa1KxWWKA5meTz557Y`) |
| TLS | Let's Encrypt R12, expires Jul 10 2026 |
| Anti-bot | Cloudflare Turnstile on demo endpoints |
| Auth | Cookie-based sessions, 307 redirect on unauthenticated access |
| API style | Next.js Server Actions (not REST routes for humanizer) |
| IP | 216.150.1.1 |

## Known Endpoints

| Endpoint | Method | Auth Required | Notes |
|----------|--------|---------------|-------|
| `/api/humanize` | POST | Yes (401) | Main humanizer — server action target |
| `/api/scan` | POST | Yes (401) | AI detector for logged-in users |
| `/api/scan-demo` | POST | Turnstile token | Landing page demo detector (500 without token) |
| `/api/usage` | GET | Yes (401) | Usage/quota stats |

## Dashboard Routes (all 307 without auth)

- `/dashboard` — main dashboard
- `/dashboard/humanize` — humanizer tool
- `/dashboard/detector` — AI detector
- `/dashboard/ai-detector` — alternate detector route
- `/dashboard/account` — account settings
- `/dashboard/plans` — plan/pricing management

## Models

| Model | Tier | Description |
|-------|------|-------------|
| Ghost 5.2 Mini | Free | Fast, natural humanization (default for free users) |
| Ghost 5.2 Pro | Paid | Stronger coherence and readability |
| Ghost 5.1 | Legacy | Previous generation, still selectable |
| Ghost 4.6 | Legacy | Still available |

No upstream model names disclosed (no OpenAI/Anthropic/MiniMax/Gemini references in any bundle).

## Feature Map

### Humanizer
- **Levels 1–10**: progressive rewrite aggression
  - 1–3: minimal changes, preserve original tone
  - 4–6: moderate rewrite
  - 7: recommended starting level ("strong rewrite, natural sounding")
  - 7–10: heavy rewrite with maximum variation
- **Three re-operation modes** (all free, don't count against daily limit):
  - Rehumanize: rewrites original text from scratch again
  - Humanize More: tries to improve current output
  - Re-humanize Output: takes current output and refines it deeper
- **Sentence-level editing**: click red sentences after humanizing to swap in alternative phrasings
- **Markdown warning**: markdown formatting can inflate AI detection scores
- **Processing time**: under 10 seconds
- **Multi-language**: English, Spanish, French, German, Italian, Portuguese, Dutch, Chinese, Japanese

### Detector
- **Scanner V2** (default, newer, more accurate) and **V1** (legacy, still available)
- Scans shared between humanizer page and standalone detector (same daily allowance)
- Rescanning humanized results is free

### Limits
- Only the initial "Humanize" action counts against daily word/action limit
- Rehumanize, Humanize More, Re-humanize Output, and rescans are all free

## Key FAQ Insights

1. "Claude tends to give the best base text" — they explicitly recommend Claude for initial generation
2. "Most humanizers produce awkward, error-filled text" — their pitch is quality/cleanliness
3. "No public API" — web-only tool, API "may be offered in the future"
4. Discord community: discord.gg/stealthwriter
5. "The quality of your initial text matters more than anything" — source quality > rewrite level

## What We Don't Know Yet

1. **Actual API payload structure** — request body fields (text, level, model, etc.)
2. **Response format** — how humanized text is returned (streaming? JSON? sentence-level alternatives?)
3. **Upstream models** — what foundation models Ghost 5.2 wraps (could be fine-tuned, could be prompt-engineered)
4. **Scoring logic** — how their V2 scanner works internally
5. **Server action IDs** — the Next.js action hashes that map to humanize/scan functions (loaded in authenticated page chunks only)
6. **Rate limit structure** — exact daily limits per plan tier
7. **Alternative phrasing generation** — how they generate per-sentence alternatives for the click-to-swap UI

## JS Bundle Analysis

The API call logic is NOT in the landing page bundles. Server action references (`createServerReference`) exist in the framework chunk (`05yoza-i5t6at.js`) but actual action registrations (with hash IDs) are in page-level chunks loaded lazily only on authenticated dashboard pages.

Bundles analyzed:
- `0c~yvwfqx6gbx.js` — React runtime, no action IDs
- `0zb9dr9gd.rcz.js` — Scanner UI component (score display, version toggle, scan states)
- `0o~9ierecqonf.js` — FAQ content, landing animations, feature descriptions
- `05yoza-i5t6at.js` — Server action infrastructure (createServerReference, registerServerReference)
- `0pkfqo48e3tds.js` — Contains `next-action` header reference
- `0jxz2f-3dznkc.js` — Contains `callServer` implementation

The scanner UI component reveals the state machine: scanning → scanScore (original/humanized) → verdict. Scores are percentages (0–100, ≥50 = human). Two-scan flow: original score → humanize → humanized score.
