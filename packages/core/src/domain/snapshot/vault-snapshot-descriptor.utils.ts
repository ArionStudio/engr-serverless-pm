import type { VaultSnapshot } from "./vault-snapshot";
import type { VaultSnapshotDescriptor } from "./vault-snapshot-descriptor.type";
import type { Vault } from "../vault/vault";
import { compareVersionVectors } from "../versioning/version-vector.utils";
import type { VersionVectorRelation } from "../versioning/version-vector.type";

export function compareVaultSnapshotDescriptors(
  local: VaultSnapshotDescriptor,
  remote: VaultSnapshotDescriptor,
): VersionVectorRelation {
  return compareVersionVectors(local.versionVector, remote.versionVector);
}

export function areVaultSnapshotDescriptorsEqual(
  actual: VaultSnapshotDescriptor,
  expected: VaultSnapshotDescriptor,
): boolean {
  return (
    actual.vaultId === expected.vaultId &&
    actual.revisionTimestamp === expected.revisionTimestamp &&
    compareVersionVectors(actual.versionVector, expected.versionVector) ===
      "equal"
  );
}

export function toVaultSnapshotDescriptor(
  vaultId: string,
  vault: Vault,
  vaultSnapshot: VaultSnapshot,
): VaultSnapshotDescriptor {
  return {
    vaultId,
    versionVector: vault.versionVector,
    revisionTimestamp: vaultSnapshot.metadata.revisionTimestamp,
  };
}
