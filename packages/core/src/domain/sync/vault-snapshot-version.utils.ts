import type { RemoteVaultSnapshotDescriptor } from "./remote-vault-snapshot-descriptor.type";
import type { VaultSnapshot } from "../snapshot/vault-snapshot";
import type { Vault } from "../vault/vault";
import { compareVersionVectors } from "./version-vector.utils";
import type { LocalRemoteSnapshotVersionRelation } from "./vault-snapshot-version.type";

export function compareLocalAndRemoteSnapshotDescriptors(
  local: RemoteVaultSnapshotDescriptor,
  remote: RemoteVaultSnapshotDescriptor,
): LocalRemoteSnapshotVersionRelation {
  return compareVersionVectors(local.versionVector, remote.versionVector);
}

export function areRemoteVaultSnapshotDescriptorsEqual(
  actual: RemoteVaultSnapshotDescriptor,
  expected: RemoteVaultSnapshotDescriptor,
): boolean {
  return (
    actual.vaultId === expected.vaultId &&
    actual.revisionTimestamp === expected.revisionTimestamp &&
    compareVersionVectors(actual.versionVector, expected.versionVector) ===
      "equal"
  );
}

export function toRemoteVaultSnapshotDescriptor(
  vaultId: string,
  vault: Vault,
  vaultSnapshot: VaultSnapshot,
): RemoteVaultSnapshotDescriptor {
  return {
    vaultId,
    versionVector: vault.versionVector,
    revisionTimestamp: vaultSnapshot.metadata.revisionTimestamp,
  };
}
