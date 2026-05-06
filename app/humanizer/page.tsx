import { ComingSoon } from "@/components/coming-soon";

export const metadata = {
  title: "Text Humanizer — Context Toolkit",
};

export default function Page() {
  return (
    <ComingSoon
      title="Text Humanizer"
      tagline="AI text in. Human-readable out."
      description="Rewrites AI-generated text to read naturally. Targets 90%+ on common AI detectors via varied sentence rhythm, natural transitions, and personal voice."
      whatItWillDo={[
        "Paste any AI-written passage",
        "Pick a target tone (casual / academic / professional)",
        "Multi-pass rewrite with structure-preserving edits",
        "Score against common detectors before returning",
      ]}
    />
  );
}
