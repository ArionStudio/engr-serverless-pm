export type ThemePreference = "light" | "dark" | "system";

const VALID_VALUES: readonly ThemePreference[] = ["light", "dark", "system"];

export const ThemePreference = {
  default: (): ThemePreference => "system",

  isValid: (value: string): value is ThemePreference =>
    VALID_VALUES.includes(value as ThemePreference),

  parse: (value: string | null): ThemePreference =>
    value && ThemePreference.isValid(value) ? value : ThemePreference.default(),

  isSystem: (value: ThemePreference): boolean => value === "system",
} as const;
