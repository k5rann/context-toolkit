import { ComingSoon } from "@/components/coming-soon";

export const metadata = {
  title: "Voice to Text — Context Toolkit",
};

export default function Page() {
  return (
    <ComingSoon
      title="Voice to Text"
      tagline="Speak. See it transcribed."
      description="Real-time speech-to-text using your browser's native engine. Zero API cost, zero rate limits."
      whatItWillDo={[
        "Push to talk — instant on-screen transcription",
        "Auto-punctuation and paragraph breaks",
        "Save sessions to revisit later",
        "Export as markdown, plain text, or copy to clipboard",
      ]}
    />
  );
}
