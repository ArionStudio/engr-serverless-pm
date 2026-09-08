import type { BrowserLoginCapabilities } from "@/ui/features/entries/browser-login.type";
import { getApplication } from "./first-launch.capabilities";
import {
  loginDetectionEnabled,
  setLoginDetection,
  capturedLoginSessionRetentionEnabled,
  setCapturedLoginSessionRetention,
} from "./login-detection";
export function composeBrowserLogins(): BrowserLoginCapabilities {
  return {
    inspectAuthorization: async (vaultId) => {
      await (await getApplication()).readVaultWorkspace.execute({ vaultId });
    },
    read: async (vaultId) =>
      (await getApplication()).browserLogins.read.execute({ vaultId }),
    fill: async (vaultId, entryId, target) =>
      (await getApplication()).browserLogins.fill.execute({
        vaultId,
        entryId,
        target,
      }),
    dismiss: async (vaultId, tabId, id) =>
      (await getApplication()).browserLogins.dismiss.execute({
        vaultId,
        tabId,
        id,
      }),
    detectionEnabled: loginDetectionEnabled,
    setDetection: setLoginDetection,
    sessionRetentionEnabled: capturedLoginSessionRetentionEnabled,
    setSessionRetention: setCapturedLoginSessionRetention,
  };
}
