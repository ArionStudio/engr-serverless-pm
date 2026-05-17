import type { SerializedWrapped } from "../crypto/protected-artifact";
import type { VaultMasterKey } from "./brand-keys";

export type DeviceKeySlot = {
  protectedVaultMasterKey: SerializedWrapped<VaultMasterKey>;
  deviceId: string;
};

export type RecoveryKeySlot = {
  protectedVaultMasterKey: SerializedWrapped<VaultMasterKey>;
};
