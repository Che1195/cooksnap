"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";

const themes = ["system", "light", "dark"] as const;
const icons = {
  system: Monitor,
  light: Sun,
  dark: Moon,
} as const;
const labels = {
  system: "System theme",
  light: "Light theme",
  dark: "Dark theme",
} as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" className="h-8 w-8" disabled>
        <Monitor className="h-4 w-4" />
      </Button>
    );
  }

  const current = (theme as (typeof themes)[number]) ?? "system";
  const nextIndex = (themes.indexOf(current) + 1) % themes.length;
  const next = themes[nextIndex];
  const Icon = icons[current];

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8"
      onClick={() => setTheme(next)}
      aria-label={labels[current]}
    >
      <Icon className="h-4 w-4" />
    </Button>
  );
}
