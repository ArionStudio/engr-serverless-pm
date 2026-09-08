import type { BrowserLogins, BrowserLoginTarget } from "@lfspm/core";
export type BrowserLoginCapabilities = {
  read: (vaultId: string) => Promise<BrowserLogins>;
  fill: (
    vaultId: string,
    entryId: string,
    target: BrowserLoginTarget,
  ) => Promise<void>;
  dismiss: (vaultId: string, tabId: number, id: string) => Promise<void>;
  detectionEnabled: () => Promise<boolean>;
  setDetection: (enabled: boolean) => Promise<void>;
};
