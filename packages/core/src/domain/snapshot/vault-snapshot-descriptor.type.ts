import type { VersionVector } from "../versioning/version-vector.type";

export type VaultSnapshotDescriptor = {
  readonly vaultId: string;
  readonly snapshotVersionVector: VersionVector;
  readonly revisionTimestamp: number;
};

export type VaultSnapshotIdentity = {
  readonly descriptor: VaultSnapshotDescriptor;
  readonly snapshotDigest: string;
};

export type ReviewedVaultSnapshotIdentities = {
  readonly local: VaultSnapshotIdentity;
  readonly remote: VaultSnapshotIdentity;
};
