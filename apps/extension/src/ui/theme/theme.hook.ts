import { useState, useEffect, useCallback } from "react";

export type ThemePreference = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "spm-theme";

function resolveTheme(
  preference: ThemePreference,
  systemIsDark: boolean,
): ResolvedTheme {
  if (preference === "system") return systemIsDark ? "dark" : "light";
  return preference;
}

function loadPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system")
      return stored;
  } catch {
    console.warn("Failed to load theme preference from localStorage");
  }
  return "system";
}

function applyTheme(theme: ResolvedTheme) {
  document.documentElement.classList.remove("light", "dark");
  document.documentElement.classList.add(theme);
}

export interface UseThemeReturn {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  isDark: boolean;
  setTheme: (preference: ThemePreference) => void;
}

export function useThemeInternal(): UseThemeReturn {
  const [preference, setPreference] = useState<ThemePreference>(loadPreference);
  const [systemIsDark, setSystemIsDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );

  const resolved = resolveTheme(preference, systemIsDark);

  useEffect(() => {
    applyTheme(resolved);
  }, [resolved]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setSystemIsDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const setTheme = useCallback((next: ThemePreference) => {
    setPreference(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      console.warn("Failed to save theme preference to localStorage");
    }
  }, []);

  return { preference, resolved, isDark: resolved === "dark", setTheme };
}
