import type { DeviceAccessMaterial } from "../../domain/device-trust/device-access-material";
import type { DeviceAccessRecoveryBackup } from "../../domain/device-trust/device-access-recovery-backup";
import type { VaultSnapshot } from "../../domain/snapshot/vault-snapshot";
import type { LocalVaultDescriptor } from "../../domain/vault/local-vault-descriptor";
import type { LocalVaultTrustCheckpoint } from "../../domain/device-trust";
import type { EncryptedDeviceSyncCredentialState } from "../../domain/sync/device-sync-credential-state";
import type { PendingDeviceEnrollment } from "../../domain/device-trust";

export interface VaultLocalRepositoryPort {
  /**
   * Atomically creates all local records for a new vault. Implementations must
   * reject when any local record already exists for the vault and avoid
   * leaving a partial descriptor/material/recovery-backup/snapshot set when
   * this rejects.
   */
  saveInitializedLocalVault: (params: {
    readonly descriptor: LocalVaultDescriptor;
    readonly deviceAccessMaterial: DeviceAccessMaterial;
    readonly deviceAccessRecoveryBackup: DeviceAccessRecoveryBackup;
    readonly snapshot: VaultSnapshot;
    readonly checkpoint: LocalVaultTrustCheckpoint;
    readonly syncCredentialState?: EncryptedDeviceSyncCredentialState;
  }) => Promise<void>;
  removePersistedLocalVault: (vaultId: string) => Promise<void>;
  /**
   * Atomically removes all local records for a vault only when its current
   * snapshot still matches `expectedSnapshotDigest`. Returns false without
   * changing any record when the snapshot is absent or has changed.
   */
  removePersistedLocalVaultIfSnapshotMatches: (
    vaultId: string,
    expectedSnapshotDigest: string,
  ) => Promise<boolean>;

  saveLocalVaultDescriptor: (descriptor: LocalVaultDescriptor) => Promise<void>;
  getLocalVaultDescriptor: (
    vaultId: string,
  ) => Promise<LocalVaultDescriptor | null>;
  listLocalVaultDescriptors: () => Promise<LocalVaultDescriptor[]>;
  removeLocalVaultDescriptor: (vaultId: string) => Promise<void>;

  saveDeviceAccessMaterial: (
    deviceAccessMaterial: DeviceAccessMaterial,
  ) => Promise<void>;
  /**
   * Atomically replaces local device trust material and its recovery backup.
   * Implementations must avoid leaving only one side updated when this rejects.
   */
  saveRecoveredDeviceAccess: (
    deviceAccessMaterial: DeviceAccessMaterial,
    deviceAccessRecoveryBackup: DeviceAccessRecoveryBackup,
  ) => Promise<void>;
  getDeviceAccessMaterial: (
    vaultId: string,
  ) => Promise<DeviceAccessMaterial | null>;
  removeDeviceAccessMaterial: (vaultId: string) => Promise<void>;

  saveDeviceAccessRecoveryBackup: (
    deviceAccessRecoveryBackup: DeviceAccessRecoveryBackup,
  ) => Promise<void>;
  getDeviceAccessRecoveryBackup: (
    vaultId: string,
  ) => Promise<DeviceAccessRecoveryBackup | null>;
  removeDeviceAccessRecoveryBackup: (vaultId: string) => Promise<void>;

  getVaultSnapshot: (vaultId: string) => Promise<VaultSnapshot | null>;
  removeVaultSnapshot: (vaultId: string) => Promise<void>;

  /**
   * Atomically replaces the snapshot, signed rollback checkpoint, and optional
   * local sync credential state only when the persisted snapshot still matches
   * `expectedSnapshotDigest`. An omitted credential state remains unchanged;
   * `null` removes it. Rejects with `LocalVaultSnapshotChangedError` without
   * changing any record when the expected snapshot is no longer current.
   */
  saveVaultSnapshotWithCheckpoint: (params: {
    readonly expectedSnapshotDigest: string;
    readonly snapshot: VaultSnapshot;
    readonly checkpoint: LocalVaultTrustCheckpoint;
    readonly syncCredentialState?: EncryptedDeviceSyncCredentialState | null;
  }) => Promise<void>;
  getLocalVaultTrustCheckpoint: (
    vaultId: string,
  ) => Promise<LocalVaultTrustCheckpoint | null>;
  removeLocalVaultTrustCheckpoint: (vaultId: string) => Promise<void>;

  saveDeviceSyncCredentialState: (
    vaultId: string,
    state: EncryptedDeviceSyncCredentialState,
  ) => Promise<void>;
  getDeviceSyncCredentialState: (
    vaultId: string,
  ) => Promise<EncryptedDeviceSyncCredentialState | null>;
  /**
   * Idempotent: removing an already-absent local credential record succeeds.
   */
  removeDeviceSyncCredentialState: (vaultId: string) => Promise<void>;

  savePendingDeviceEnrollment: (
    enrollment: PendingDeviceEnrollment,
  ) => Promise<void>;
  getPendingDeviceEnrollment: (
    requestId: string,
  ) => Promise<PendingDeviceEnrollment | null>;
  removePendingDeviceEnrollment: (requestId: string) => Promise<void>;
}
