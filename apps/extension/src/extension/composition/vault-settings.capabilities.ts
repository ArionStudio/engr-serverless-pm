import type { RawMasterPassword } from "@lfspm/core";
import type { VaultSettingsCapabilities } from "@/ui/features/settings/settings.type";
import { getApplication } from "./first-launch.capabilities";
import {
  durationValue,
  preference,
  preferenceKey,
  writePreference,
} from "./vault-preferences";

export function composeVaultSettings(): VaultSettingsCapabilities {
  async function requireVault(vaultId: string) {
    const app = await getApplication();
    await app.readVaultWorkspace.execute({ vaultId });
    return app;
  }
  return {
    inspectAuthorization: async (vaultId) => {
      await requireVault(vaultId);
    },
    changePassword: async (vaultId, currentPassword, password) =>
      await navigator.locks.request("lfspm:first-vault-setup", async () => {
        const app = await requireVault(vaultId);
        await app.changeMasterPassword.execute({
          vaultId,
          currentMasterPassword: currentPassword as RawMasterPassword,
          newMasterPassword: password as RawMasterPassword,
        });
      }),
    saveDevice: async (vaultId, name, duration) =>
      await navigator.locks.request("lfspm:first-vault-setup", async () => {
        const deviceName = name.trim();
        if (!deviceName || deviceName.length > 80)
          throw new Error("Enter a device name up to 80 characters");
        const lockDuration = durationValue(duration);
        await requireVault(vaultId);
        const settings = await preference(vaultId);
        await writePreference(vaultId, {
          ...settings,
          deviceName,
          duration: lockDuration,
        });
      }),
    removeLocalVault: async (vaultId) =>
      await navigator.locks.request("lfspm:first-vault-setup", async () => {
        const app = await requireVault(vaultId);
        await app.deleteLocalVault.execute({ vaultId });
        // The vault is already deleted. A leftover non-secret preference must
        // not turn a successful deletion into an instruction to retry it.
        try {
          await chrome.storage.local.remove(preferenceKey(vaultId));
        } catch {
          /* non-secret cleanup */
        }
      }),
  };
}
