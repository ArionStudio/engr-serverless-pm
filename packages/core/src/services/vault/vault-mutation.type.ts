import type { SyncUploadStatus } from "../../domain/sync/sync-upload-status.type";
import type { VersionVector } from "../../domain/versioning/version-vector.type";

export type VaultMutationResult = {
  readonly snapshotVersionVector: VersionVector;
  readonly revisionTimestamp: number;
  readonly syncUpload: SyncUploadStatus;
  readonly syncConfigured: boolean;
};
