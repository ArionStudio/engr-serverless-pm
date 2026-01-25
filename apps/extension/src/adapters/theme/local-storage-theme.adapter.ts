import type { ThemeRepositoryPort } from "@/core/theme/theme-repository.port";
import { ThemePreference } from "@/core/theme/theme-preference.type";

const STORAGE_KEY = "spm-theme";

export const localStorageThemeAdapter: ThemeRepositoryPort = {
  save: (preference) => {
    try {
      localStorage.setItem(STORAGE_KEY, preference);
    } catch (error) {
      console.error("Failed to save theme preference:", error);
    }
  },

  load: () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return ThemePreference.parse(stored);
    } catch (error) {
      console.error("Failed to load theme preference:", error);
      return ThemePreference.default();
    }
  },
};
