export interface Mode {
  id: string;
  label: string;
  short: string;
  description: string;
}

export const MODES: Mode[] = [
  {
    id: "caveman",
    label: "Caveman",
    short: "Token economy",
    description:
      "3-6 word sentences, no preamble, tool-first responses. 50-75% per-response token savings.",
  },
  {
    id: "senior",
    label: "Senior engineer",
    short: "No hand-holding",
    description:
      "Assume 5+ years experience. Skip basics. Trade-offs over single answers. Decision-first.",
  },
  {
    id: "teacher",
    label: "Teacher",
    short: "Explain everything",
    description:
      "Define every term, walk through code line-by-line, explain WHY before WHAT.",
  },
  {
    id: "devil",
    label: "Devil's advocate",
    short: "Find weaknesses",
    description:
      "Stress-test recommendations. 'Where this breaks' section. Name alternatives. Reverse conditions.",
  },
  {
    id: "production",
    label: "Production-grade",
    short: "Error handling, logging",
    description:
      "Real users, not demo. Error handling on every external call. Structured logging. Hostile inputs.",
  },
  {
    id: "speedrun",
    label: "Speedrun",
    short: "Quickest working demo",
    description:
      "Single file. Hardcoded defaults. No tests, no types, no comments. Working > clean.",
  },
  {
    id: "testfirst",
    label: "Test-first",
    short: "TDD discipline",
    description:
      "Failing test before any implementation. Red → green → refactor. Behavior-named tests.",
  },
  {
    id: "stdlib",
    label: "Stdlib-only",
    short: "No third-party deps",
    description:
      "No pip/npm/cargo. urllib not requests, json not orjson. Stops if external pkg truly required.",
  },
  {
    id: "tldr",
    label: "TL;DR-first",
    short: "Answer first, details after",
    description:
      "First line: one-sentence answer. Second line: most important caveat. Then details.",
  },
];

export interface Preset {
  id: string;
  label: string;
  modes: string[];
  description: string;
}

export const PRESETS: Preset[] = [
  {
    id: "production_set",
    label: "Production code",
    modes: ["production", "senior", "testfirst"],
    description: "Senior tone + production-grade code + TDD. For shippable work.",
  },
  {
    id: "demo_set",
    label: "Quick demo",
    modes: ["speedrun", "caveman"],
    description: "Speedrun output + minimal tokens. For prototypes you'll throw away.",
  },
  {
    id: "learning_set",
    label: "Learning material",
    modes: ["teacher", "tldr"],
    description: "Teacher mode + TL;DR-first. For tutorials and explainers.",
  },
  {
    id: "review_set",
    label: "Critical review",
    modes: ["devil", "senior"],
    description: "Devil's advocate + senior tone. For stress-testing existing decisions.",
  },
];

export interface Template {
  label: string;
  title: string;
  input: string;
  extra: string;
}

export const TEMPLATES: Template[] = [
  {
    label: "CLI",
    title: "Build a CLI tool",
    input:
      "build a python cli tool that converts markdown files into nicely formatted PDFs",
    extra: "",
  },
  {
    label: "Web",
    title: "Make a web app",
    input:
      "build me a habit tracker web app where i can log daily habits and see streaks",
    extra:
      "should be a single-page app, deployable on a free tier (vercel/netlify), data persists locally",
  },
  {
    label: "Doc",
    title: "Write an explainer",
    input:
      "explain how transformers work in a 2000-word blog post for a CS undergraduate",
    extra: "",
  },
  {
    label: "Compare",
    title: "Compare options",
    input:
      "compare postgres vs sqlite for a personal finance app i'm building solo",
    extra: "",
  },
  {
    label: "Debug",
    title: "Debug a problem",
    input:
      "my flask app returns 502 when uploading files larger than 10MB, walk me through how to diagnose and fix",
    extra: "",
  },
  {
    label: "Game",
    title: "Game from scratch",
    input:
      "build me a 2D side-scrolling platformer in pygame with double-jump and collectibles",
    extra: "",
  },
];

export interface Tool {
  id: string;
  href: string;
  name: string;
  tagline: string;
  description: string;
  status: "live" | "soon";
  icon: string;
}

export const TOOLS: Tool[] = [
  {
    id: "bundler",
    href: "/bundler",
    name: "Context Bundler",
    tagline: "Vague request in. Master prompt out.",
    description:
      "Expands a one-liner into a structured master prompt for Claude, ChatGPT, Gemini. With code-level validation, banned-word scanning, and 9 stackable modes.",
    status: "live",
    icon: "Layers",
  },
  {
    id: "humanizer",
    href: "/humanizer",
    name: "Text Humanizer",
    tagline: "Draft in. Voice-matched rewrite out.",
    description:
      "Rewrites rough text around your purpose and voice. Add a writing sample, pick a content mode, and get internal scores for readability, repetition, generic phrasing, variety, and meaning.",
    status: "live",
    icon: "Sparkles",
  },
  {
    id: "voice",
    href: "/voice",
    name: "Voice to Text",
    tagline: "Speak. See it transcribed.",
    description:
      "Real-time speech-to-text via your browser's native Web Speech engine. Zero API cost, zero rate limits, no key. 15 languages. Edit inline, copy, or download.",
    status: "live",
    icon: "Mic",
  },
  {
    id: "conference",
    href: "/conference",
    name: "Conference Notes",
    tagline: "Multi-speaker. Color-coded transcript.",
    description:
      "Real-time diarization via Deepgram Nova-3. Auto-detects who's speaking and color-codes each voice. Live transcript, copy or download when done.",
    status: "live",
    icon: "Notebook",
  },
];
