# Context Toolkit

A growing suite of focused AI tools — Next.js + Tailwind + shadcn/ui, deployed on Vercel.

**Live tools:**
- **Context Bundler** — vague request → full master prompt with code-level validation, banned-word scanning, 9 stackable modes

**Coming soon:**
- Text Humanizer — AI text → human-readable
- Voice to Text — browser-native speech transcription
- Conference Notes — continuous listening with smart extraction

## Run locally

```bash
git clone https://github.com/<you>/context-toolkit.git
cd context-toolkit
npm install
cp .env.example .env.local
# (optional) set GEMINI_API_KEY for shared default; set APP_PASSWORD for private gating
npm run dev
```

Open http://localhost:3000.

## Deploy to Vercel

1. Push to GitHub
2. Import the repo at https://vercel.com/new
3. (Optional) Set environment variables in Vercel project settings:
   - `GEMINI_API_KEY` — shared default key
   - `APP_PASSWORD` — private password gate
4. Deploy

## How key handling works

| `GEMINI_API_KEY` | `APP_PASSWORD` | Behavior |
|---|---|---|
| Unset | Unset | Open BYO-key — visitors paste their own key |
| Set | Unset | Open shared — shared key default, visitors can paste own for unlimited |
| Set | Set | Private shared — password gate, then shared key |
| Unset | Set | Private BYO-key — password gate, then visitors paste their own |

Personal keys pasted by visitors are stored in their browser's localStorage only — never sent to the server.

## Tech

- Next.js 16 (App Router)
- React 19
- Tailwind CSS 4
- shadcn/ui (Radix primitives)
- Gemini API via `@google/generative-ai`
- next-themes for system / light / dark
- Lucide icons

## Built by

[Karanvir Panwar](mailto:karanvirsp8077@gmail.com)
