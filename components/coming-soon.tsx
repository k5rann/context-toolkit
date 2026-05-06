import { Hammer, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface ComingSoonProps {
  title: string;
  tagline: string;
  description: string;
  whatItWillDo: string[];
}

export function ComingSoon({
  title,
  tagline,
  description,
  whatItWillDo,
}: ComingSoonProps) {
  return (
    <div className="space-y-8 max-w-2xl">
      <div className="space-y-3">
        <Badge variant="secondary" className="rounded-full">
          <Hammer className="h-3 w-3 mr-1.5" />
          Coming soon
        </Badge>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
          {title}
        </h1>
        <p className="text-lg text-muted-foreground">{tagline}</p>
      </div>

      <p className="text-base leading-relaxed text-muted-foreground/90">
        {description}
      </p>

      <Card className="border-border/60 bg-muted/10">
        <CardContent className="p-6 space-y-3">
          <div className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
            What it will do
          </div>
          <ul className="space-y-2">
            {whatItWillDo.map((item, i) => (
              <li key={i} className="flex gap-3 items-start text-sm">
                <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0 text-emerald-500" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground border-t border-border/40 pt-4">
        This tool is being built next. Check back soon.
      </p>
    </div>
  );
}
