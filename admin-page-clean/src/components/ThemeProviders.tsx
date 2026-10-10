import * as React from "react";
import { ThemeProvider as NextThemeProvider, useTheme } from "next-themes";
import { ThemeProvider as MuiThemeProvider } from "@mui/material/styles";
import { buildMuiTheme } from "@/lib/muiTheme";

/** MUI follows next-themes: rebuilt from the CSS vars whenever the mode flips. */
function MuiBridge({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme();
  const mode = resolvedTheme === "dark" ? "dark" : "light";
  // The `.dark` class is applied by next-themes in an effect, so wait a frame
  // before reading the computed variables.
  const [theme, setTheme] = React.useState(() => buildMuiTheme(mode));
  React.useEffect(() => {
    const id = requestAnimationFrame(() => setTheme(buildMuiTheme(mode)));
    return () => cancelAnimationFrame(id);
  }, [mode]);
  return <MuiThemeProvider theme={theme}>{children}</MuiThemeProvider>;
}

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      storageKey="contest_admin_theme"
    >
      <MuiBridge>{children}</MuiBridge>
    </NextThemeProvider>
  );
}
