"use client";

import * as React from "react";
import { Menu, KeyRound, ExternalLink } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-background/60 backdrop-blur transition-colors hover:bg-muted/60 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Settings"
      >
        <Menu className="h-4 w-4" />
        {status === "missing" && (
          <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-background animate-pulse" />
        )}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[360px] !p-5 !rounded-2xl !shadow-2xl"
      >
        <div className="space-y-5 w-full">
          {/* API KEY SECTION */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold tracking-widest text-muted-foreground uppercase">
              <KeyRound className="h-3 w-3" />
              Gemini API Key
            </div>

            <div
              className={`flex items-center gap-3 rounded-xl border bg-muted/30 px-3.5 py-2.5 ring-2 ring-transparent transition-all ${cfg.ring}`}
            >
              <span className={`h-2 w-2 rounded-full ${cfg.dot} flex-shrink-0`} />
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
              className="font-mono text-sm h-11"
            />

            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Get a free key from aistudio.google.com
              <ExternalLink className="h-3 w-3" />
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
      </PopoverContent>
    </Popover>
  );
}
