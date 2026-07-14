import type { SyncConfig } from "../sync/sync-config.type";
import type { VersionVector } from "../versioning/version-vector.type";
import type {
  DeviceEnrollmentSecret,
  DevicePrivateSignKey,
} from "./brand-keys";
import type { LocalVaultTrustAnchor } from "./vault-trust";

export type DeviceEnrollmentBundle = {
  readonly version: 1;
  readonly vaultId: string;
  readonly syncConfig: SyncConfig;
  readonly snapshotVersionVector: VersionVector;
  readonly revisionTimestamp: number;
  readonly enrollmentSecret: DeviceEnrollmentSecret;
  readonly pendingDevicePrivateSignKey: DevicePrivateSignKey;
  readonly vaultTrustAnchor: LocalVaultTrustAnchor;
};
