import { createTheme, type Theme } from "@mui/material/styles";

/**
 * Builds the MUI theme from the CSS variables in index.css, so the stylesheet
 * stays the single source of truth for colour. MUI manipulates palette values
 * (alpha/darken/...), so it needs literal colours: we read the *computed* vars
 * and hand them over as comma-separated hsl() strings.
 */
const read = (name: string, fallback: string) => {
  if (typeof document === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(`--${name}`)
    .trim();
  const m = v.match(/^([\d.]+)\s+([\d.]+%)\s+([\d.]+%)$/);
  return m ? `hsl(${m[1]}, ${m[2]}, ${m[3]})` : fallback;
};

export function buildMuiTheme(mode: "light" | "dark"): Theme {
  const c = (n: string, f = "hsl(0, 0%, 50%)") => read(n, f);
  return createTheme({
    cssVariables: false,
    palette: {
      mode,
      primary: { main: c("primary"), contrastText: c("primary-foreground") },
      secondary: { main: c("secondary"), contrastText: c("secondary-foreground") },
      error: { main: c("destructive"), contrastText: c("destructive-foreground") },
      success: { main: c("success"), contrastText: c("success-foreground") },
      warning: { main: c("warning"), contrastText: c("warning-foreground") },
      info: { main: c("info"), contrastText: c("info-foreground") },
      background: { default: c("background"), paper: c("card") },
      text: {
        primary: c("foreground"),
        secondary: c("muted-foreground"),
        disabled: c("muted-foreground"),
      },
      divider: c("border"),
      action: {
        hover: c("accent"),
        selected: c("accent"),
        active: c("muted-foreground"),
      },
    },
    shape: { borderRadius: 8 },
    typography: { fontFamily: "'Public Sans', 'Inter', sans-serif" },
    components: {
      MuiCssBaseline: { styleOverrides: { body: { backgroundColor: "transparent" } } },
      MuiCard: {
        styleOverrides: {
          root: { backgroundImage: "none", borderColor: c("border") },
        },
      },
      MuiPaper: { styleOverrides: { root: { backgroundImage: "none" } } },
    },
  });
}
