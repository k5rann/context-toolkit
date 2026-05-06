"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiKeyPopover } from "@/components/api-key-popover";

export function SiteHeader() {
  const pathname = usePathname();
  const isHome = pathname === "/" || pathname === "/auth";

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/40 bg-background/70 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-3">
          {!isHome && (
            <Link href="/">
              <Button variant="ghost" size="sm" className="gap-1 -ml-2">
                <ChevronLeft className="h-4 w-4" />
                <span className="hidden sm:inline">Toolkit</span>
              </Button>
            </Link>
          )}
          <Link href="/" className="font-semibold tracking-tight text-base">
            Context Toolkit
          </Link>
        </div>
        <ApiKeyPopover />
      </div>
    </header>
  );
}
