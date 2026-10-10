import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "contest_theme";

interface ThemeContextValue {
  /** What the user picked (may be "system"). */
  theme: Theme;
  /** What is actually applied right now. */
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function readStored(): Theme {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* storage blocked */
  }
  return "system";
}

/** System preference: Telegram's own colour scheme first, then the OS. */
function systemTheme(): ResolvedTheme {
  const tg = window.Telegram?.WebApp?.colorScheme;
  if (tg === "dark" || tg === "light") return tg;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStored);
  const [systemValue, setSystemValue] = useState<ResolvedTheme>(systemTheme);

  const resolvedTheme: ResolvedTheme = theme === "system" ? systemValue : theme;

  // Follow OS / Telegram changes while on "system".
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    const update = () => setSystemValue(systemTheme());
    mq?.addEventListener?.("change", update);
    const tg = window.Telegram?.WebApp as
      | { onEvent?: (e: string, cb: () => void) => void; offEvent?: (e: string, cb: () => void) => void }
      | undefined;
    tg?.onEvent?.("themeChanged", update);
    return () => {
      mq?.removeEventListener?.("change", update);
      tg?.offEvent?.("themeChanged", update);
    };
  }, []);

  // Apply the class + sync Telegram chrome colours.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", resolvedTheme === "dark");
    root.style.colorScheme = resolvedTheme;
    const bg = getComputedStyle(root).getPropertyValue("--background").trim();
    if (bg) {
      const css = `hsl(${bg})`;
      const tg = window.Telegram?.WebApp as
        | { setHeaderColor?: (c: string) => void; setBackgroundColor?: (c: string) => void }
        | undefined;
      try {
        const probe = document.createElement("canvas").getContext("2d");
        if (probe) {
          probe.fillStyle = css;
          const hex = probe.fillStyle as string; // normalised to #rrggbb
          tg?.setHeaderColor?.(hex);
          tg?.setBackgroundColor?.(hex);
        }
      } catch {
        /* older Telegram clients */
      }
    }
  }, [resolvedTheme]);

  const setTheme = useCallback((next: Theme) => {
    const root = document.documentElement;
    root.classList.add("theme-transition");
    window.setTimeout(() => root.classList.remove("theme-transition"), 350);
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage blocked */
    }
  }, []);

  const toggleTheme = useCallback(
    () => setTheme(resolvedTheme === "dark" ? "light" : "dark"),
    [resolvedTheme, setTheme]
  );

  const value = useMemo(
    () => ({ theme, resolvedTheme, setTheme, toggleTheme }),
    [theme, resolvedTheme, setTheme, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
