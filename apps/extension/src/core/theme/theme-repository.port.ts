import type { ThemePreference } from "./theme-preference.type";

export interface ThemeRepositoryPort {
  save(preference: ThemePreference): void;
  load(): ThemePreference;
}
