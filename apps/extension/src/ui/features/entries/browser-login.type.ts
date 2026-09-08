import type { BrowserLogins, BrowserLoginTarget } from "@lfspm/core";
export type BrowserLoginCapabilities = {
  inspectAuthorization: (vaultId: string) => Promise<void>;
  read: (vaultId: string) => Promise<BrowserLogins>;
  fill: (
    vaultId: string,
    entryId: string,
    target: BrowserLoginTarget,
  ) => Promise<void>;
  dismiss: (vaultId: string, tabId: number, id: string) => Promise<void>;
  detectionEnabled: () => Promise<boolean>;
  sessionRetentionEnabled: () => Promise<boolean>;
  setSessionRetention: (enabled: boolean) => Promise<void>;
  setDetection: (enabled: boolean) => Promise<void>;
};
