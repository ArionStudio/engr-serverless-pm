import type { VersionVector } from "../versioning/version-vector.type";

export type VaultSnapshotDescriptor = {
  readonly vaultId: string;
  readonly versionVector: VersionVector;
  readonly revisionTimestamp: number;
};
