"use client";

import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const options = [
    { value: "system", icon: Monitor, label: "System" },
    { value: "light", icon: Sun, label: "Light" },
    { value: "dark", icon: Moon, label: "Dark" },
  ];

  return (
    <div className="inline-flex rounded-lg border border-border bg-muted/30 p-1">
      {options.map(({ value, icon: Icon, label }) => {
        const active = theme === value;
        return (
          <Button
            key={value}
            variant="ghost"
            size="sm"
            onClick={() => setTheme(value)}
            className={`h-8 px-3 gap-1.5 ${
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="text-xs font-medium">{label}</span>
          </Button>
        );
      })}
    </div>
  );
}
