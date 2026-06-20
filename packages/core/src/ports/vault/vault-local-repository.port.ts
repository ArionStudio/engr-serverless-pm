import type { DeviceAccessMaterial } from "../../domain/device-trust/device-access-material";
import type { DeviceAccessRecoveryBackup } from "../../domain/device-trust/device-access-recovery-backup";
import type { VaultSnapshot } from "../../domain/snapshot/vault-snapshot";
import type { LocalVaultDescriptor } from "../../domain/vault/local-vault-descriptor";

export interface VaultLocalRepositoryPort {
  /**
   * Atomically creates all local records for a new vault. Implementations must
   * avoid leaving a partial descriptor/material/recovery-backup/snapshot set
   * when this rejects.
   */
  saveInitializedLocalVault: (
    descriptor: LocalVaultDescriptor,
    deviceAccessMaterial: DeviceAccessMaterial,
    deviceAccessRecoveryBackup: DeviceAccessRecoveryBackup,
    snapshot: VaultSnapshot,
  ) => Promise<void>;
  removePersistedLocalVault: (vaultId: string) => Promise<void>;

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

  saveVaultSnapshot: (vaultSnapshot: VaultSnapshot) => Promise<void>;
  getVaultSnapshot: (vaultId: string) => Promise<VaultSnapshot | null>;
  removeVaultSnapshot: (vaultId: string) => Promise<void>;
}
