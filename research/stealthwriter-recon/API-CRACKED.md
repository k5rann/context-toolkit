# Stealthwriter API — Fully Reversed (2026-05-14)

## Encryption Scheme

Client-side XOR obfuscation (not real crypto):

```
Static key:  sw_r3sp0ns3_k3y_2024!xQ9  (24 chars, hardcoded in client JS)
Per-request:  random 12-char salt (sent as "s" field)
Full key:    static + salt  (36 chars, repeating XOR)
Encode:      JSON → XOR with key → base64 → send as "d" field
```

Both request AND response use the same scheme (different salt per direction).

## Request Payload

```
POST /api/humanize
Content-Type: application/json
Cookie: __Secure-better-auth.session_token=...; __Secure-better-auth.session_data=...
```

```json
{
  "d": "<base64 XOR-encrypted JSON>",
  "s": "<12-char random salt>"
}
```

Decrypted inner JSON:
```json
{
  "text": "The input text to humanize...",
  "level": 8,
  "model": 3,
  "fp": "825c045855851da69fc5ac428ee35ad9",
  "is_rehumanize": false
}
```

| Field | Type | Description |
|-------|------|-------------|
| `text` | string | Raw input text |
| `level` | int 1-10 | Rewrite aggression (1=light, 10=heavy) |
| `model` | int | Model ID: 3=Ghost 5.2 Mini, likely 4=Ghost 5.2 Pro |
| `fp` | string | MD5 device fingerprint (anti-abuse) |
| `is_rehumanize` | bool | false=first humanize, true=rehumanize/humanize more |

## Response Payload

Same encryption: `{"d": "<encrypted>", "s": "<salt>"}`

Decrypted inner JSON:
```json
{
  "sentences": [
    {
      "id": 0,
      "original": "Original sentence from input.",
      "alternatives": [
        {
          "sentence": "Heavily rewritten version...",
          "rank": 0.999
        },
        {
          "sentence": "Medium rewrite...",
          "rank": 0.88
        },
        {
          "sentence": "Light rewrite...",
          "rank": 0.82
        },
        {
          "sentence": "Original sentence from input.",
          "rank": 0.003
        }
      ]
    }
  ]
}
```

### Response Structure

- Input is **split into sentences**
- Each sentence gets **3-4 alternatives** ranked by humanization quality (0-1)
- The **original sentence is always included** as the lowest-ranked alternative (~0.003-0.28)
- The top-ranked alternative (~0.99) is selected by default
- Users can click sentences in the UI to swap between alternatives

### Ranking Scale

| Rank Range | Meaning |
|-----------|---------|
| 0.95-1.0 | Heavy rewrite, maximum variation |
| 0.8-0.95 | Medium rewrite |
| 0.5-0.8 | Light rewrite |
| 0.0-0.5 | Minimal change or original |

## Auth System

- Library: `better-auth`
- Session cookies: `__Secure-better-auth.session_token` + `__Secure-better-auth.session_data`
- Session data is base64 JSON with user info, session expiry, IP, user agent
- Google OAuth supported
- Session expiry: 7 days from creation

## Example Rewrites (Level 8, Ghost 5.2 Mini)

### Sentence 1
**Original:** "Artificial intelligence has fundamentally transformed the way organizations approach cybersecurity in the modern digital landscape."

| Rank | Rewrite |
|------|---------|
| 99.9% | "In the modern digital world, AI has revolutionized the cybersecurity realm as organizations strive to keep up with evolving threats and trends." |
| 88.1% | "In today's digital realm, artificial intelligence has revolutionized the way organizations approach cybersecurity." |
| 82.4% | "In the digital age, AI has revolutionized cybersecurity for organizations." |
| 0.4% | Original (unchanged) |

### Sentence 2
**Original:** "These sophisticated systems leverage advanced machine learning algorithms to identify and mitigate potential threats in real time, significantly reducing response times and improving overall security posture."

| Rank | Rewrite |
|------|---------|
| 99.9% | "These high-tech solutions use cutting-edge machine learning algorithms to detect and respond to potential threats in real-time, minimizing response time and enhancing security posture." |
| 98.4% | "These high-tech solutions use state-of-the-art machine learning algorithms to detect and counteract potential risks as soon as they appear, thereby minimizing reaction times and enhancing overall security posture." |
| 60.4% | "These advanced systems utilize cutting-edge machine learning algorithms to detect and neutralize potential dangers in real-time, minimizing response times and enhancing security posture." |
| 28.6% | Original (unchanged) |

## Pattern Analysis

Their rewrites consistently:
1. **Replace formal verbs** — "leverage" → "use", "identify and mitigate" → "detect and respond to"
2. **Simplify noun phrases** — "sophisticated systems" → "high-tech solutions"
3. **Restructure sentence opening** — moved "in the modern digital landscape" from end to beginning
4. **Shorten where possible** — 82% rank version is much shorter
5. **Replace AI trigger words** — "fundamentally transformed" → "revolutionized"
6. **Keep factual content** — all facts preserved across alternatives

These patterns match exactly what our style-anchor approach does.

## Implications for Veil

1. **Sentence-level processing** — we currently process the full text as one block. Splitting into sentences + generating alternatives per sentence would give users the same click-to-swap UX.
2. **Multiple candidates** — they generate 3+ rewrites per sentence at different aggression levels, not just one. We could sample our model multiple times with different temperatures.
3. **Ranking model** — their ranking scores are very precise, suggesting a scoring function (possibly AI detection probability).
4. **The core technique is register shift** — same as our style-anchor. Replace formal/academic vocabulary with casual/plain equivalents. They're not doing anything fundamentally novel.
