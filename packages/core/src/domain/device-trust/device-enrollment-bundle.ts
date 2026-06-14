import type { SyncConfig } from "../sync/sync-config.type";
import type { DeviceEnrollmentSecret, DevicePublicSignKey } from "./brand-keys";

export type DeviceEnrollmentBundle = {
  readonly version: 1;
  readonly vaultId: string;
  readonly syncConfig: SyncConfig;
  readonly snapshotSignerPublicKey: DevicePublicSignKey;
  readonly enrollmentSecret: DeviceEnrollmentSecret;
};
