import type { SerializedEncrypted } from "../crypto/protected-artifact";
import type {
  SyncCredentials,
  SyncProvider,
  SyncTarget,
} from "./sync-config.type";
import type { VaultSnapshotIdentity } from "../snapshot/vault-snapshot-descriptor.type";

export type DeviceSyncCredentialState = {
  readonly currentCredentials: SyncCredentials;
  readonly pendingSnapshotUpload?: {
    readonly candidateSnapshotIdentity: VaultSnapshotIdentity;
    readonly expectedRemoteSnapshotIdentity: VaultSnapshotIdentity | null;
  };
  readonly previousCredentials?: {
    readonly credentials: SyncCredentials;
    readonly revokedDeviceIds: readonly string[];
    readonly vaultKeyGeneration: number;
  };
};

export type EncryptedDeviceSyncCredentialState =
  SerializedEncrypted<DeviceSyncCredentialState>;

export type DeviceSyncCredentialEncryptionContext = {
  readonly vaultId: string;
  readonly deviceId: string;
  readonly provider: SyncProvider;
  readonly target: SyncTarget;
};
