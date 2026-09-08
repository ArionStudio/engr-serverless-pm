import type { VaultSettingsCapabilities } from "@/ui/features/settings/settings.type";

export type SettingsScenario =
  | "ready"
  | "save-pending"
  | "save-error"
  | "deletion-error"
  | "authorization-lost";

export function galleryVaultSettings(
  scenario: SettingsScenario = "ready",
  onSaveDevice?: (name: string, duration: number) => void,
): VaultSettingsCapabilities {
  async function save() {
    if (scenario === "save-pending") await new Promise<void>(() => {});
    if (scenario === "save-error" || scenario === "authorization-lost")
      throw new Error("Settings unavailable");
  }
  return {
    inspectAuthorization: async () => {
      if (scenario === "authorization-lost")
        throw new Error("Vault authorization lost");
    },
    changePassword: save,
    saveDevice: async (_vaultId, name, duration) => {
      await save();
      onSaveDevice?.(name.trim(), duration);
    },
    removeLocalVault: async () => {
      if (scenario === "deletion-error")
        throw new Error("Deletion unavailable");
    },
  };
}
