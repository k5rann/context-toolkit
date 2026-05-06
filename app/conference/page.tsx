import { ComingSoon } from "@/components/coming-soon";

export const metadata = {
  title: "Conference Notes — Context Toolkit",
};

export default function Page() {
  return (
    <ComingSoon
      title="Conference Notes"
      tagline="Listen all session. Get clean notes."
      description="Continuous listening with smart highlighting. Auto-extracts decisions, action items, key quotes from meetings and lectures."
      whatItWillDo={[
        "Always-on listening with one-tap toggle",
        "Live transcript that you can scroll through",
        "AI extracts decisions, questions, and action items in real time",
        "Export final notes as markdown with timestamps",
      ]}
    />
  );
}
