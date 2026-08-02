import type { VaultSnapshot } from "./vault-snapshot";
import type {
  ReviewedVaultSnapshotDescriptors,
  VaultSnapshotDescriptor,
} from "./vault-snapshot-descriptor.type";
import { compareVersionVectors } from "../versioning/version-vector.utils";
import type { VersionVectorRelation } from "../versioning/version-vector.type";

export function cloneVaultSnapshotDescriptor(
  descriptor: VaultSnapshotDescriptor,
): VaultSnapshotDescriptor {
  return {
    vaultId: descriptor.vaultId,
    snapshotVersionVector: { ...descriptor.snapshotVersionVector },
    revisionTimestamp: descriptor.revisionTimestamp,
  };
}

export function cloneReviewedVaultSnapshotDescriptors(
  descriptors: ReviewedVaultSnapshotDescriptors,
): ReviewedVaultSnapshotDescriptors {
  return {
    local: cloneVaultSnapshotDescriptor(descriptors.local),
    remote: cloneVaultSnapshotDescriptor(descriptors.remote),
  };
}

export function compareVaultSnapshotDescriptors(
  local: VaultSnapshotDescriptor,
  remote: VaultSnapshotDescriptor,
): Exclude<VersionVectorRelation, "remote_missing"> {
  return compareVersionVectors(
    local.snapshotVersionVector,
    remote.snapshotVersionVector,
  );
}

export function areVaultSnapshotDescriptorsEqual(
  actual: VaultSnapshotDescriptor,
  expected: VaultSnapshotDescriptor,
): boolean {
  return (
    actual.vaultId === expected.vaultId &&
    actual.revisionTimestamp === expected.revisionTimestamp &&
    compareVersionVectors(
      actual.snapshotVersionVector,
      expected.snapshotVersionVector,
    ) === "equal"
  );
}

export function toVaultSnapshotDescriptor(
  vaultId: string,
  vaultSnapshot: VaultSnapshot,
): VaultSnapshotDescriptor {
  return cloneVaultSnapshotDescriptor({
    vaultId,
    snapshotVersionVector: vaultSnapshot.metadata.snapshotVersionVector,
    revisionTimestamp: vaultSnapshot.metadata.revisionTimestamp,
  });
}
