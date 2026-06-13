import type { Vault } from "./vault";

export function removeVaultSyncConfig(vault: Vault): Vault {
  return {
    versionVector: vault.versionVector,
    entries: vault.entries,
    deletedEntries: vault.deletedEntries,
    deviceProfiles: vault.deviceProfiles,
    deletedDeviceProfiles: vault.deletedDeviceProfiles,
    tags: vault.tags,
    deletedTags: vault.deletedTags,
  };
}
