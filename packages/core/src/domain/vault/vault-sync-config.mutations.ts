import type { VaultSnapshotDescriptor } from "../snapshot/vault-snapshot-descriptor.type";
import type { VaultSnapshot } from "../snapshot/vault-snapshot";
import type { Vault } from "./vault";

export function markVaultSyncRemovalPending(
  vault: Vault,
  expectedRemoteSnapshotDescriptor: VaultSnapshotDescriptor | null,
  rollbackSnapshot: VaultSnapshot,
): Vault {
  return {
    ...vault,
    syncRemovalPending: {
      expectedRemoteSnapshotDescriptor,
      rollbackSnapshot,
    },
  };
}

export function clearVaultSyncRemovalPending(vault: Vault): Vault {
  const { syncRemovalPending, ...vaultWithoutSyncRemovalPending } = vault;
  void syncRemovalPending;

  return vaultWithoutSyncRemovalPending;
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
