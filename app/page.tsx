import Link from "next/link";
import { ArrowUpRight, Layers, Sparkles, Mic, Notebook } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TOOLS } from "@/lib/catalogs";

const ICONS = { Layers, Sparkles, Mic, Notebook } as const;

export default function HomePage() {
  return (
    <div className="space-y-12 sm:space-y-16">
      <section className="space-y-4 max-w-3xl">
        <h1 className="text-5xl sm:text-7xl font-bold tracking-tight leading-[1.05]">
          <span className="bg-gradient-to-br from-foreground via-foreground to-foreground/40 bg-clip-text text-transparent">
            Context
            <br />
            Toolkit
          </span>
        </h1>
        <p className="text-base sm:text-xl text-muted-foreground leading-relaxed max-w-2xl">
          A growing suite of focused AI tools. Built for prompt engineers,
          students, and anyone who wants speed without setup.
        </p>
      </section>

      <section className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
            Tools
          </h2>
          <span className="text-xs text-muted-foreground font-mono">
            {TOOLS.filter((t) => t.status === "live").length} live ·{" "}
            {TOOLS.filter((t) => t.status === "soon").length} coming
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {TOOLS.map((tool) => {
            const Icon = ICONS[tool.icon as keyof typeof ICONS] || Layers;
            const isLive = tool.status === "live";

            const inner = (
              <Card
                className={`group relative overflow-hidden border-border/60 transition-all duration-300 h-full ${
                  isLive
                    ? "hover:border-primary/40 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-primary/5 cursor-pointer"
                    : "opacity-60"
                }`}
              >
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="rounded-xl bg-muted/50 p-2.5 ring-1 ring-border/60 group-hover:bg-primary/10 group-hover:ring-primary/30 transition-colors">
                      <Icon className="h-5 w-5" />
                    </div>
                    {isLive ? (
                      <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                    ) : (
                      <Badge
                        variant="secondary"
                        className="text-[10px] tracking-wider uppercase font-semibold"
                      >
                        Soon
                      </Badge>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <h3 className="text-lg font-semibold tracking-tight">
                      {tool.name}
                    </h3>
                    <p className="text-sm text-muted-foreground font-medium">
                      {tool.tagline}
                    </p>
                  </div>
                  <p className="text-sm text-muted-foreground/80 leading-relaxed">
                    {tool.description}
                  </p>
                </CardContent>
              </Card>
            );

            return isLive ? (
              <Link key={tool.id} href={tool.href} className="block">
                {inner}
              </Link>
            ) : (
              <div key={tool.id}>{inner}</div>
            );
          })}
        </div>
      </section>

      <section className="border-t border-border/40 pt-8 space-y-2">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="space-y-0.5">
            <div className="text-sm font-medium">Built by Karanvir Panwar</div>
            <a
              href="mailto:karanvirsp8077@gmail.com"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              karanvirsp8077@gmail.com
            </a>
          </div>
          <div className="text-xs text-muted-foreground font-mono">
            Next.js · Tailwind · shadcn/ui · Gemini
          </div>
        </div>
      </section>
    </div>
  );
}
