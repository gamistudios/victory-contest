import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

/** Sun/Moon switch: the two icons rotate + cross-fade into each other. */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === "dark";

  const flip = () => {
    const root = document.documentElement;
    root.classList.add("theme-transition");
    window.setTimeout(() => root.classList.remove("theme-transition"), 350);
    setTheme(isDark ? "light" : "dark");
  };

  return (
    <button
      type="button"
      onClick={flip}
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Light mode" : "Dark mode"}
      className={cn(
        "tight group relative inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-card text-muted-foreground transition-all duration-200 hover:bg-accent hover:text-foreground active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className
      )}
    >
      <Sun
        size={20}
        aria-hidden="true"
        className={cn(
          "absolute transition-all duration-500 ease-out motion-reduce:transition-none",
          isDark
            ? "-rotate-90 scale-0 opacity-0"
            : "rotate-0 scale-100 text-warning opacity-100"
        )}
      />
      <Moon
        size={20}
        aria-hidden="true"
        className={cn(
          "absolute transition-all duration-500 ease-out motion-reduce:transition-none",
          isDark
            ? "rotate-0 scale-100 text-info opacity-100"
            : "rotate-90 scale-0 opacity-0"
        )}
      />
    </button>
  );
}
