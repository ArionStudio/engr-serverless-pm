import type { SerializedWrapped } from "../crypto/protected-artifact";
import type { DevicePublicSignKey } from "../device-trust";
import type { VaultMasterKey } from "./brand-keys";

export type DeviceKeySlot = {
  deviceId: string;
  protectedVaultMasterKey: SerializedWrapped<VaultMasterKey>;
  publicSignKey: DevicePublicSignKey;
};

export type RecoveryKeySlot = {
  protectedVaultMasterKey: SerializedWrapped<VaultMasterKey>;
};

export type EnrollmentKeySlot = {
  protectedVaultMasterKey: SerializedWrapped<VaultMasterKey>;
};
