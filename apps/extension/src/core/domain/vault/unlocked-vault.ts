import type { DevicePrivateSignKey } from "../device/brand-keys";
import type { VaultMasterKey } from "../snapshot/brand-keys";
import type { Vault } from "./vault";

export type UnlockedVault = {
  readonly vaultId: string;
  readonly deviceId: string;
  readonly vault: Vault;
  readonly vaultMasterKey: VaultMasterKey;
  readonly devicePrivateSignKey: DevicePrivateSignKey;
};
