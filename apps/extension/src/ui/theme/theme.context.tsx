import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useThemeWithDeps, type UseThemeReturn } from "@/core/theme";
import {
  localStorageThemeAdapter,
  documentThemeAdapter,
  mediaQuerySystemThemeAdapter,
} from "@/adapters/theme";

const ThemeContext = createContext<UseThemeReturn | null>(null);

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const deps = useMemo(
    () => ({
      repository: localStorageThemeAdapter,
      applier: documentThemeAdapter,
      systemDetector: mediaQuerySystemThemeAdapter,
    }),
    [],
  );

  const theme = useThemeWithDeps(deps);

  return (
    <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme(): UseThemeReturn {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
