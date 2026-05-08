export type HumanizerReferenceStyle =
  | "student"
  | "direct"
  | "academic"
  | "business";

export interface ReferenceStyleProfile {
  id: HumanizerReferenceStyle;
  label: string;
  short: string;
  description: string;
  rhythm: string[];
  use: string[];
  avoid: string[];
}

export const REFERENCE_STYLES: ReferenceStyleProfile[] = [
  {
    id: "student",
    label: "Student",
    short: "First-person, grounded",
    description:
      "For reflections, class paragraphs, and personal explanations that need to sound lived-in.",
    rhythm: [
      "mostly first-person when notes are first-person",
      "short to medium paragraphs, often starting with the actual friction instead of the topic",
      "plain transitions like so, but, then, because, and sometimes no transition at all",
    ],
    use: [
      "lead with a real moment from the notes rather than a role label or topic sentence",
      "keep ordinary details from the source notes",
      "admit friction or uncertainty when the notes imply it",
      "prefer specific tools, classes, tasks, places, or habits over general claims",
      "let one sentence sound slightly blunt or unfinished if that is how a student would say it",
    ],
    avoid: [
      "opening with as a student",
      "speaking for all students unless the draft proves it",
      "advice-article framing",
      "explaining productivity as a general topic before talking about the user's actual situation",
      "perfectly balanced final sentences",
      "for me / the main challenge / that's why as repeated paragraph machinery",
    ],
  },
  {
    id: "direct",
    label: "Direct",
    short: "Plain and human",
    description:
      "For casual paragraphs, notes, replies, and explanations that should feel straightforward.",
    rhythm: [
      "compact sentences mixed with a few longer ones",
      "direct subject-verb wording",
      "light contractions when they fit the mode",
    ],
    use: [
      "lead with the actual point",
      "keep useful roughness instead of polishing every edge",
      "use everyday wording when it carries the meaning",
    ],
    avoid: [
      "formal throat-clearing",
      "inflated nouns where verbs would work",
      "smoothing every sentence into the same shape",
    ],
  },
  {
    id: "academic",
    label: "Academic",
    short: "Careful, not stiff",
    description:
      "For school or research prose that needs precision without sounding inflated.",
    rhythm: [
      "clear claims followed by evidence or qualification",
      "moderate sentence length",
      "paragraphs that move one idea at a time",
    ],
    use: [
      "preserve terms, citations, and careful qualifiers",
      "make claims precise without overselling them",
      "choose concrete academic verbs like shows, suggests, compares, argues",
    ],
    avoid: [
      "grand introductions",
      "empty sophistication",
      "unearned certainty",
    ],
  },
  {
    id: "business",
    label: "Business",
    short: "Clear and useful",
    description:
      "For emails, updates, proposals, and professional notes that should be concise.",
    rhythm: [
      "short opening with the concrete offer or service",
      "clean paragraph breaks that match website sections",
      "simple next-step wording when the original implies a call to action",
    ],
    use: [
      "make the offer, service, audience, or outcome easy to find",
      "keep names, dates, numbers, and constraints exact",
      "cut filler while preserving tone",
      "replace vague benefits with clearer wording when the original supports it",
      "keep website copy scan-friendly without turning it into hype",
    ],
    avoid: [
      "corporate filler",
      "over-friendly padding",
      "vague positive language with no action",
      "generic claims that could fit any company",
      "inventing proof, guarantees, awards, results, or customer outcomes",
    ],
  },
];

const REFERENCE_STYLE_BY_ID = Object.fromEntries(
  REFERENCE_STYLES.map((style) => [style.id, style])
) as Record<HumanizerReferenceStyle, ReferenceStyleProfile>;

export function getReferenceStyleProfile(
  style: HumanizerReferenceStyle
): ReferenceStyleProfile {
  return REFERENCE_STYLE_BY_ID[style] ?? REFERENCE_STYLE_BY_ID.student;
}

export function buildReferenceStyleGuidance(
  style: HumanizerReferenceStyle
): string {
  const profile = getReferenceStyleProfile(style);

  return `REFERENCE STYLE LIBRARY: ${profile.label}
Use this profile as broad editorial guidance only. It is a safe built-in style profile, not scraped personal writing and not wording to copy.

Rhythm:
${profile.rhythm.map((item) => `- ${item}`).join("\n")}

Use:
${profile.use.map((item) => `- ${item}`).join("\n")}

Avoid:
${profile.avoid.map((item) => `- ${item}`).join("\n")}`;
}
