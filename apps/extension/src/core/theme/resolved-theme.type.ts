import type { ThemePreference } from "./theme-preference.type";

export type ResolvedTheme = "light" | "dark";

export const ResolvedTheme = {
  fromPreference: (
    preference: ThemePreference,
    systemIsDark: boolean,
  ): ResolvedTheme => {
    if (preference === "system") {
      return systemIsDark ? "dark" : "light";
    }
    return preference === "dark" ? "dark" : "light";
  },

  isDark: (theme: ResolvedTheme): boolean => theme === "dark",
} as const;
