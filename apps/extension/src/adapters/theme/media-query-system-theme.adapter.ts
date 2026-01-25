import type { SystemThemeDetectorPort } from "@/core/theme/system-theme-detector.port";

export function createMediaQuerySystemThemeAdapter(): SystemThemeDetectorPort {
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

  return {
    isDarkMode: () => mediaQuery.matches,

    subscribe: (callback) => {
      const handler = (event: MediaQueryListEvent) => callback(event.matches);
      mediaQuery.addEventListener("change", handler);
      return () => mediaQuery.removeEventListener("change", handler);
    },
  };
}

export const mediaQuerySystemThemeAdapter: SystemThemeDetectorPort =
  createMediaQuerySystemThemeAdapter();
