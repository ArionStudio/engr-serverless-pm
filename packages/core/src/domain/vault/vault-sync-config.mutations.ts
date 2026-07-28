import type { Vault } from "./vault";

export function markVaultSyncRemovalPending(vault: Vault): Vault {
  return {
    ...vault,
    syncRemovalPending: true,
  };
}

export function removeVaultSyncConfig(vault: Vault): Vault {
  const { syncConfig, syncRemovalPending, ...vaultWithoutSyncConfig } = vault;
  void syncConfig;
  void syncRemovalPending;

  return vaultWithoutSyncConfig;
}
