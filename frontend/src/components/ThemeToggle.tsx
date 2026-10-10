import { Moon, Sun } from "lucide-react";
import { useTheme } from "../context/ThemeContext";
import { cn } from "../lib/utils";

/** Sun/Moon switch: the two icons rotate + cross-fade into each other. */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, toggleTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  return (
    <button
      type="button"
      onClick={toggleTheme}
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Light mode" : "Dark mode"}
      className={cn(
        "group relative inline-flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted text-muted-foreground transition-all duration-200 hover:bg-secondary hover:text-foreground active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className
      )}
    >
      <Sun
        size={20}
        aria-hidden="true"
        className={cn(
          "absolute transition-all duration-500 ease-out motion-reduce:transition-none",
          isDark ? "-rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100 text-warning"
        )}
      />
      <Moon
        size={20}
        aria-hidden="true"
        className={cn(
          "absolute transition-all duration-500 ease-out motion-reduce:transition-none",
          isDark ? "rotate-0 scale-100 opacity-100 text-info" : "rotate-90 scale-0 opacity-0"
        )}
      />
    </button>
  );
}
