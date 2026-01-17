import { useState, useEffect, useCallback } from "react";
import type { ThemePreference } from "./theme-preference.type";
import {
  type ResolvedTheme,
  ResolvedTheme as ResolvedThemeUtils,
} from "./resolved-theme.type";
import type { ThemeRepositoryPort } from "./theme-repository.port";
import type { ThemeApplierPort } from "./theme-applier.port";
import type { SystemThemeDetectorPort } from "./system-theme-detector.port";

export interface ThemeState {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  isLoading: boolean;
}

export interface ThemeDependencies {
  repository: ThemeRepositoryPort;
  applier: ThemeApplierPort;
  systemDetector: SystemThemeDetectorPort;
}

export interface UseThemeReturn extends ThemeState {
  setTheme: (preference: ThemePreference) => void;
  setLight: () => void;
  setDark: () => void;
  setSystem: () => void;
  isDark: boolean;
  isLight: boolean;
}

export function useThemeWithDeps(deps: ThemeDependencies): UseThemeReturn {
  const { repository, applier, systemDetector } = deps;

  const [preference, setPreference] = useState<ThemePreference>(() =>
    repository.load(),
  );
  const [systemIsDark, setSystemIsDark] = useState(() =>
    systemDetector.isDarkMode(),
  );
  const [isLoading] = useState(false);

  const resolved = ResolvedThemeUtils.fromPreference(preference, systemIsDark);

  // Apply theme to DOM whenever resolved changes
  useEffect(() => {
    applier.apply(resolved);
  }, [resolved, applier]);

  // Subscribe to system theme changes
  useEffect(() => {
    return systemDetector.subscribe(setSystemIsDark);
  }, [systemDetector]);

  const setTheme = useCallback(
    (newPreference: ThemePreference) => {
      setPreference(newPreference);
      repository.save(newPreference);
    },
    [repository],
  );

  const setLight = useCallback(() => setTheme("light"), [setTheme]);
  const setDark = useCallback(() => setTheme("dark"), [setTheme]);
  const setSystem = useCallback(() => setTheme("system"), [setTheme]);

  return {
    preference,
    resolved,
    isLoading,
    setTheme,
    setLight,
    setDark,
    setSystem,
    isDark: resolved === "dark",
    isLight: resolved === "light",
  };
}
