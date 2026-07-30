import type { Vault } from "./vault";

export function markVaultSyncRemovalPending(vault: Vault): Vault {
  return {
    ...vault,
    syncRemovalPending: true,
  };
}

export function removeVaultSyncTarget(vault: Vault): Vault {
  const { syncTarget, syncRemovalPending, ...vaultWithoutSyncTarget } = vault;
  void syncTarget;
  void syncRemovalPending;

  return vaultWithoutSyncTarget;
}
