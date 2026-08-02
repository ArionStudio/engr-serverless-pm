import type { VersionVector } from "../versioning/version-vector.type";

export type VaultSnapshotDescriptor = {
  readonly vaultId: string;
  readonly snapshotVersionVector: VersionVector;
  readonly revisionTimestamp: number;
};

export type ReviewedVaultSnapshotDescriptors = {
  readonly local: VaultSnapshotDescriptor;
  readonly remote: VaultSnapshotDescriptor;
};
