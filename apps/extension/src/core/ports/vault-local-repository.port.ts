import type { DeviceAccessMaterial } from "../domain/device/device-access-material";
import type { VaultSnapshot } from "../domain/snapshot/vault-snapshot";

export interface VaultLocalRepositoryPort {
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
