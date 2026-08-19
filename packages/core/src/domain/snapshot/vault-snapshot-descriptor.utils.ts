import type { VaultSnapshot } from "./vault-snapshot";
import type {
  ReviewedVaultSnapshotIdentities,
  VaultSnapshotDescriptor,
  VaultSnapshotIdentity,
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

export function cloneVaultSnapshotIdentity(
  identity: VaultSnapshotIdentity,
): VaultSnapshotIdentity {
  return {
    descriptor: cloneVaultSnapshotDescriptor(identity.descriptor),
    snapshotDigest: identity.snapshotDigest,
  };
}

export function areVaultSnapshotIdentitiesEqual(
  actual: VaultSnapshotIdentity,
  expected: VaultSnapshotIdentity,
): boolean {
  return (
    actual.snapshotDigest === expected.snapshotDigest &&
    areVaultSnapshotDescriptorsEqual(actual.descriptor, expected.descriptor)
  );
}

export function cloneReviewedVaultSnapshotIdentities(
  identities: ReviewedVaultSnapshotIdentities,
): ReviewedVaultSnapshotIdentities {
  return {
    local: cloneVaultSnapshotIdentity(identities.local),
    remote: cloneVaultSnapshotIdentity(identities.remote),
  };
}

export function compareVaultSnapshotDescriptors(
  local: VaultSnapshotDescriptor,
  remote: VaultSnapshotDescriptor,
): Exclude<VersionVectorRelation, "remote_missing"> {
  if (local.vaultId !== remote.vaultId) {
    return "broken";
  }

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

export function toVaultSnapshotIdentity(
  vaultId: string,
  vaultSnapshot: VaultSnapshot,
  snapshotDigest: string,
): VaultSnapshotIdentity {
  return {
    descriptor: toVaultSnapshotDescriptor(vaultId, vaultSnapshot),
    snapshotDigest,
  };
}
