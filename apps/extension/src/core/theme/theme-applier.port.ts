import type { ResolvedTheme } from "./resolved-theme.type";

export interface ThemeApplierPort {
  apply(theme: ResolvedTheme): void;
}
