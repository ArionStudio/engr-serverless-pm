import type { Vault } from "./vault";

export function markVaultSyncRemovalPending(vault: Vault): Vault {
  return {
    ...vault,
    syncRemovalPending: true,
  };
}

export function markVaultProviderCredentialRevocationPending(
  vault: Vault,
  revokedDeviceIds: readonly string[],
  vaultKeyGeneration: number,
): Vault {
  return {
    ...vault,
    providerCredentialRevocationPending: {
      revokedDeviceIds,
      vaultKeyGeneration,
    },
  };
}

export function clearVaultProviderCredentialRevocationPending(
  vault: Vault,
): Vault {
  const {
    providerCredentialRevocationPending,
    ...vaultWithoutProviderCredentialRevocation
  } = vault;
  void providerCredentialRevocationPending;

  return vaultWithoutProviderCredentialRevocation;
}

export function removeVaultSyncTarget(vault: Vault): Vault {
  const {
    syncTarget,
    syncRemovalPending,
    providerCredentialRevocationPending,
    ...vaultWithoutSyncTarget
  } = vault;
  void syncTarget;
  void syncRemovalPending;
  void providerCredentialRevocationPending;

  return vaultWithoutSyncTarget;
}
