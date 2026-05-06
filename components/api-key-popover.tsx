"use client";

import * as React from "react";
import { Menu, KeyRound, ExternalLink, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/theme-toggle";
import { useApiKey } from "@/components/api-key-provider";

export function ApiKeyPopover() {
  const { userKey, setUserKey, hasSharedKey } = useApiKey();
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  React.useEffect(() => {
    if (open) {
      const original = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = original;
      };
    }
  }, [open]);

  const status = userKey ? "personal" : hasSharedKey ? "shared" : "missing";

  const statusConfig = {
    personal: {
      dot: "bg-emerald-500",
      ring: "ring-emerald-500/30",
      label: "Personal key active",
      sub: "Unlimited use",
    },
    shared: {
      dot: "bg-blue-500",
      ring: "ring-blue-500/30",
      label: "Using shared community key",
      sub: "Add your own for unlimited use",
    },
    missing: {
      dot: "bg-amber-500",
      ring: "ring-amber-500/30",
      label: "No key set",
      sub: "Required to generate",
    },
  } as const;

  const cfg = statusConfig[status];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Settings"
        className="relative inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl border border-border bg-background/80 backdrop-blur-md transition-colors active:scale-95 active:bg-muted hover:bg-muted/80 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring touch-manipulation"
      >
        <Menu className="h-5 w-5" />
        {status === "missing" && (
          <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-background animate-pulse" />
        )}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-start justify-end"
          role="dialog"
          aria-modal="true"
          aria-label="Settings"
        >
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            style={{ animation: "fadeIn 0.18s ease-out" }}
            onClick={() => setOpen(false)}
          />

          <div
            className="relative w-full sm:w-[420px] sm:m-4 sm:rounded-2xl bg-card text-card-foreground border border-border shadow-2xl h-full sm:h-auto sm:max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden"
            style={{ animation: "slideInRight 0.22s ease-out" }}
          >
            {/* Close button — floating top right */}
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="absolute top-3 right-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-muted/40 hover:bg-muted active:scale-95 transition-all touch-manipulation"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex-1 overflow-y-auto px-6 py-7 space-y-7">
              {/* API KEY SECTION */}
              <section className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                  <KeyRound className="h-3.5 w-3.5" />
                  Gemini API Key
                </div>

                <div
                  className={`flex items-center gap-3 rounded-xl border bg-muted/30 px-4 py-3 ring-2 ring-transparent transition-all ${cfg.ring}`}
                >
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${cfg.dot} flex-shrink-0`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium leading-tight">
                      {cfg.label}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {cfg.sub}
                    </div>
                  </div>
                </div>

                <Input
                  type="password"
                  value={userKey}
                  onChange={(e) => setUserKey(e.target.value)}
                  placeholder="AIzaSy..."
                  autoComplete="off"
                  spellCheck={false}
                  className="font-mono text-base h-12"
                />

                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Get a free key from aistudio.google.com
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </section>

              <hr className="border-border" />

              {/* APPEARANCE SECTION */}
              <section className="space-y-3">
                <div className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                  Appearance
                </div>
                <ThemeToggle />
              </section>
            </div>
          </div>

          <style>{`
            @keyframes fadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            @keyframes slideInRight {
              from { transform: translateX(100%); opacity: 0; }
              to { transform: translateX(0); opacity: 1; }
            }
          `}</style>
        </div>
      )}
    </>
  );
}
