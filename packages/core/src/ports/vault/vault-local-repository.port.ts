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
   * this rejects. Access material and its recovery backup must carry the same
   * freshly generated `localAccessGenerationId`.
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

  /**
   * Atomically replaces device access material only when the persisted record
   * still has `expectedDeviceAccessMaterialRevision` and
   * `expectedLocalAccessGenerationId`, and the replacement retains that
   * generation and device identity. Revisions are positive safe integers; the
   * replacement revision must be exactly the expected revision plus one.
   * Rejects exhausted or invalid revisions and all other conflicts with
   * `DeviceAccessMaterialChangedError` without changing the record when
   * another writer replaced it first.
   */
  saveDeviceAccessMaterial: (params: {
    readonly expectedDeviceAccessMaterialRevision: number;
    readonly expectedLocalAccessGenerationId: string;
    readonly deviceAccessMaterial: DeviceAccessMaterial;
  }) => Promise<void>;
  /**
   * Atomically compares and replaces local device trust material and its
   * recovery backup. `null` expected material fields permit recovery when
   * access material is absent and must be rejected when material is present.
   * Both replacements must use the same fresh generation ID, distinct from
   * the persisted backup generation.
   * Revisions are positive safe integers. Each replacement revision must be
   * exactly its expected revision plus one; absent material starts at revision
   * one. Exhausted or invalid revisions are conflicts.
   * Implementations must reject with
   * `DeviceAccessMaterialChangedError` without changing either record when an
   * expected revision, generation ID, or device identity no longer matches.
   * When material is present, the persisted pair and both replacements must
   * each carry the same vault ID, device ID, and generation ID.
   */
  saveRecoveredDeviceAccess: (params: {
    readonly expectedDeviceAccessMaterialRevision: number | null;
    readonly expectedDeviceAccessMaterialGenerationId: string | null;
    readonly expectedDeviceAccessRecoveryBackupRevision: number;
    readonly expectedDeviceAccessRecoveryBackupGenerationId: string;
    readonly deviceAccessMaterial: DeviceAccessMaterial;
    readonly deviceAccessRecoveryBackup: DeviceAccessRecoveryBackup;
  }) => Promise<void>;
  getDeviceAccessMaterial: (
    vaultId: string,
  ) => Promise<DeviceAccessMaterial | null>;
  removeDeviceAccessMaterial: (vaultId: string) => Promise<void>;

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
