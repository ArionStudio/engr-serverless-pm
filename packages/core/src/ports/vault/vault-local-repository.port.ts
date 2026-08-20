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
   * vault, device, algorithm suite, public-key identity, and freshly generated
   * `localAccessGenerationId`. Both revisions must start at one.
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
   * Atomically removes all initialized local records only when every record
   * still exactly belongs to the operation requesting rollback. The snapshot
   * is compared by digest; all other artifacts are compared exactly, and a
   * `null` sync credential expectation means the record must be absent.
   * Returns false without changing any record when an expectation changed or
   * disappeared.
   */
  removePersistedLocalVaultIfArtifactsMatch: (params: {
    readonly vaultId: string;
    readonly expectedDescriptor: LocalVaultDescriptor;
    readonly expectedDeviceAccessMaterial: DeviceAccessMaterial;
    readonly expectedDeviceAccessRecoveryBackup: DeviceAccessRecoveryBackup;
    readonly expectedSnapshotDigest: string;
    readonly expectedCheckpoint: LocalVaultTrustCheckpoint;
    readonly expectedSyncCredentialState: EncryptedDeviceSyncCredentialState | null;
  }) => Promise<boolean>;

  saveLocalVaultDescriptor: (descriptor: LocalVaultDescriptor) => Promise<void>;
  getLocalVaultDescriptor: (
    vaultId: string,
  ) => Promise<LocalVaultDescriptor | null>;
  listLocalVaultDescriptors: () => Promise<LocalVaultDescriptor[]>;
  removeLocalVaultDescriptor: (vaultId: string) => Promise<void>;

  /**
   * Atomically compares and replaces local device trust material and its
   * recovery backup. Expected material revision and generation must either
   * both be `null` when access material is absent or both identify the present
   * material. All other combinations are conflicts.
   * Both replacements must use the same fresh generation ID, distinct from
   * both persisted generations.
   * Revisions are positive safe integers. Each replacement revision must be
   * exactly its expected revision plus one; absent material starts at revision
   * one. Exhausted or invalid revisions are conflicts.
   * Implementations must reject with
   * `DeviceAccessMaterialChangedError` without changing either record when an
   * expected revision, generation ID, or device identity no longer matches.
   * The persisted recovery backup and both replacements must carry the same
   * vault ID, device ID, algorithm suite, public signing key, and public vault
   * key, including when material is absent. When material is present, it must
   * share that identity and generation with the persisted backup. The
   * replacement pair may change only the generation and local-protection
   * fields, not the device identity.
   * Retained copies of the previous backup remain usable with their original
   * recovery words while the recovered device identity remains trusted.
   */
  saveDeviceAccessRecords: (
    params: (
      | {
          readonly expectedDeviceAccessMaterialRevision: null;
          readonly expectedDeviceAccessMaterialGenerationId: null;
        }
      | {
          readonly expectedDeviceAccessMaterialRevision: number;
          readonly expectedDeviceAccessMaterialGenerationId: string;
        }
    ) & {
      readonly expectedDeviceAccessRecoveryBackupRevision: number;
      readonly expectedDeviceAccessRecoveryBackupGenerationId: string;
      readonly deviceAccessMaterial: DeviceAccessMaterial;
      readonly deviceAccessRecoveryBackup: DeviceAccessRecoveryBackup;
    },
  ) => Promise<void>;
  /**
   * Atomically reads the local access material and recovery backup from one
   * repository snapshot. Each field is `null` only when that record is absent
   * for `vaultId`.
   */
  getDeviceAccessRecords: (vaultId: string) => Promise<{
    readonly deviceAccessMaterial: DeviceAccessMaterial | null;
    readonly deviceAccessRecoveryBackup: DeviceAccessRecoveryBackup | null;
  }>;
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
   * local sync credential state only when the persisted snapshot and exact
   * signed checkpoint still match their expectations. When replacing
   * credentials, callers must also provide the exact expected encrypted
   * credential state; `null` means absent.
   * An omitted credential state remains unchanged; `null` removes it. Rejects
   * with `LocalVaultSnapshotChangedError` without changing any record when
   * either expected artifact is no longer current.
   */
  saveVaultSnapshotWithCheckpoint: (
    params: {
      readonly expectedSnapshotDigest: string;
      readonly expectedCheckpoint: LocalVaultTrustCheckpoint;
      readonly snapshot: VaultSnapshot;
      readonly checkpoint: LocalVaultTrustCheckpoint;
    } & (
      | {
          readonly expectedSyncCredentialState?: never;
          readonly syncCredentialState?: never;
        }
      | {
          readonly expectedSyncCredentialState: EncryptedDeviceSyncCredentialState | null;
          readonly syncCredentialState: EncryptedDeviceSyncCredentialState | null;
        }
    ),
  ) => Promise<void>;
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
