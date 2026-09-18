import { useEffect, useState } from "react";
import {
  ThemeProviderContext,
  type Theme,
  type ThemeProviderProps,
} from "./use-theme";

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "lowercase-ui-theme",
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem(storageKey) as Theme) || defaultTheme,
  );

  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") return "dark";
    return theme === "system" ? getSystemTheme() : theme;
  });

  useEffect(() => {
    const apply = (mode: "light" | "dark") => {
      const root = window.document.documentElement;
      root.classList.remove("light", "dark");
      root.classList.add(mode);
      setResolvedTheme(mode);
    };

    if (theme === "system") {
      apply(getSystemTheme());

      const mql = window.matchMedia("(prefers-color-scheme: light)");
      const onChange = () => apply(mql.matches ? "light" : "dark");

      // addEventListener is modern, later maybe add addListener for older
      mql.addEventListener?.("change", onChange);

      return () => {
        mql.removeEventListener?.("change", onChange);
      };
    }
    apply(theme);
  }, [theme]);

  const value = {
    theme,
    resolvedTheme,
    setTheme: (theme: Theme) => {
      localStorage.setItem(storageKey, theme);
      setTheme(theme);
    },
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

function getSystemTheme() {
  return window.matchMedia?.("(prefers-color-scheme: light)")?.matches
    ? "light"
    : "dark";
}
