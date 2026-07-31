import type { SerializedSignatureOf } from "../crypto/protected-artifact";
import type { VersionVector } from "../versioning/version-vector.type";

export type LocalVaultTrustCheckpointPayload = {
  readonly version: 1;
  readonly vaultId: string;
  readonly deviceId: string;
  readonly trustGeneration: number;
  readonly trustCertificateDigest: string;
  readonly vaultKeyGeneration: number;
  readonly snapshotVersionVector: VersionVector;
  readonly snapshotDigest: string;
};

export type LocalVaultTrustCheckpoint = {
  readonly payload: LocalVaultTrustCheckpointPayload;
  readonly signature: SerializedSignatureOf<LocalVaultTrustCheckpointPayload>;
};
