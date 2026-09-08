import type { BrowserLoginTarget } from "../../domain/browser-login/browser-login.type";

export interface BrowserLoginPort {
  inspect: () => Promise<BrowserLoginTarget | null>;
  // Implementations must recheck the active tab, URL and document identity at dispatch.
  fill: (
    target: BrowserLoginTarget,
    credentials: { readonly login: string; readonly password: string },
  ) => Promise<void>;
}
