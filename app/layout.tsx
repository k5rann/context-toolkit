import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { ApiKeyProvider } from "@/components/api-key-provider";
import { SiteHeader } from "@/components/site-header";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Context Toolkit",
  description:
    "A growing suite of focused AI tools — prompt engineering, text humanization, voice transcription, conference notes.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const hasSharedKey = !!process.env.GEMINI_API_KEY;

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange={false}
        >
          <ApiKeyProvider hasSharedKey={hasSharedKey}>
            <SiteHeader />
            <main className="mx-auto w-full max-w-6xl flex-1 px-4 sm:px-6 py-8 sm:py-12">
              {children}
            </main>
            <Toaster richColors closeButton />
          </ApiKeyProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
