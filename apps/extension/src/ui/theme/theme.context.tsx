/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, type ReactNode } from "react";
import { useThemeInternal, type UseThemeReturn } from "./theme.hook";

const ThemeContext = createContext<UseThemeReturn | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useThemeInternal();
  return (
    <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): UseThemeReturn {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
}
