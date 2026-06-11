import type { VersionVector } from "./version-vector.type";

export type RemoteVaultSnapshotDescriptor = {
  readonly vaultId: string;
  readonly versionVector: VersionVector;
  readonly revisionTimestamp: number;
};
