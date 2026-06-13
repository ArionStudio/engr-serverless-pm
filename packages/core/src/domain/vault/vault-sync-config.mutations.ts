import type { Vault } from "./vault";

export function removeVaultSyncConfig(vault: Vault): Vault {
  const { syncConfig, ...vaultWithoutSyncConfig } = vault;
  void syncConfig;

  return vaultWithoutSyncConfig;
}
