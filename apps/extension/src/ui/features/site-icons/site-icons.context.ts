import { createContext, useContext } from "react";
import type { SiteIconPreference } from "./site-icons.type";

export type SiteIconsState = SiteIconPreference & {
  readonly pending: boolean;
  readonly error?: string;
  readonly retryCleanup?: () => void;
  readonly retryRead?: () => void;
  setEnabled(enabled: boolean): void;
  source(url: string): string | undefined;
};
export const SiteIconsContext = createContext<SiteIconsState>({
  supported: false,
  enabled: false,
  cleanupRequired: false,
  pending: false,
  setEnabled: () => {},
  source: () => undefined,
});
export function useSiteIcons() {
  return useContext(SiteIconsContext);
}
