import type { DeviceAccessMaterial } from "../domain/device/device-access-material";
import type { VaultSnapshot } from "../domain/snapshot/vault-snapshot";
import type { LocalVaultDescriptor } from "../domain/vault/local-vault-descriptor";

export interface VaultLocalRepositoryPort {
  saveLocalVaultDescriptor: (descriptor: LocalVaultDescriptor) => Promise<void>;
  getLocalVaultDescriptor: (
    vaultId: string,
  ) => Promise<LocalVaultDescriptor | null>;
  listLocalVaultDescriptors: () => Promise<LocalVaultDescriptor[]>;
  removeLocalVaultDescriptor: (vaultId: string) => Promise<void>;

  saveDeviceAccessMaterial: (
    deviceAccessMaterial: DeviceAccessMaterial,
  ) => Promise<void>;
  getDeviceAccessMaterial: (
    vaultId: string,
  ) => Promise<DeviceAccessMaterial | null>;
  removeDeviceAccessMaterial: (vaultId: string) => Promise<void>;

  saveVaultSnapshot: (vaultSnapshot: VaultSnapshot) => Promise<void>;
  getVaultSnapshot: (vaultId: string) => Promise<VaultSnapshot | null>;
  removeVaultSnapshot: (vaultId: string) => Promise<void>;
}
