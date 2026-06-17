import type { VersionVector } from "../versioning/version-vector.type";

export type VaultSnapshotDescriptor = {
  readonly vaultId: string;
  readonly snapshotVersionVector: VersionVector;
  readonly revisionTimestamp: number;
};
