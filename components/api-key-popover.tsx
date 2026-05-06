"use client";

import * as React from "react";
import { Menu, KeyRound, ExternalLink } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/theme-toggle";
import { useApiKey } from "@/components/api-key-provider";

export function ApiKeyPopover() {
  const { userKey, setUserKey, hasSharedKey } = useApiKey();
  const [open, setOpen] = React.useState(false);

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
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        className="relative inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl border border-border bg-background/80 backdrop-blur-md transition-colors active:scale-95 active:bg-muted hover:bg-muted/80 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring touch-manipulation"
        aria-label="Settings"
      >
        <Menu className="h-5 w-5" />
        {status === "missing" && (
          <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-background animate-pulse" />
        )}
      </SheetTrigger>

      <SheetContent
        side="right"
        className="w-full sm:max-w-md p-0 overflow-y-auto"
      >
        <div className="p-6 pt-12 space-y-6">
          <div className="space-y-1">
            <SheetTitle className="text-lg font-semibold tracking-tight">
              Settings
            </SheetTitle>
            <SheetDescription className="text-sm">
              API key and appearance for this device.
            </SheetDescription>
          </div>

          {/* API KEY SECTION */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold tracking-widest text-muted-foreground uppercase">
              <KeyRound className="h-3 w-3" />
              Gemini API Key
            </div>

            <div
              className={`flex items-center gap-3 rounded-xl border bg-muted/30 px-3.5 py-3 ring-2 ring-transparent transition-all ${cfg.ring}`}
            >
              <span className={`h-2.5 w-2.5 rounded-full ${cfg.dot} flex-shrink-0`} />
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
          </div>

          <Separator />

          {/* APPEARANCE SECTION */}
          <div className="space-y-3">
            <div className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
              Appearance
            </div>
            <ThemeToggle />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
