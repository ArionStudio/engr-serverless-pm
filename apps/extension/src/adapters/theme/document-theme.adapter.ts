import type { ThemeApplierPort } from "@/core/theme/theme-applier.port";
import type { ResolvedTheme } from "@/core/theme/resolved-theme.type";

export function createDocumentThemeAdapter(
  root: HTMLElement = document.documentElement,
): ThemeApplierPort {
  return {
    apply: (theme: ResolvedTheme) => {
      root.classList.remove("light", "dark");
      root.classList.add(theme);
    },
  };
}

export const documentThemeAdapter: ThemeApplierPort =
  createDocumentThemeAdapter();
