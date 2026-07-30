import type { RandomBytes } from "../crypto/brand-keys";
import type { SerializedWrapped } from "../crypto/protected-artifact";
import type { LocalKeysPayload } from "./local-protection.type";
import type { DevicePublicSignKey, DeviceVaultPublicKey } from "./brand-keys";

export type DeviceAccessMaterial = {
  readonly vaultId: string;
  readonly deviceId: string;
  readonly algorithmSuiteId: string;
  readonly masterPasswordSalt: RandomBytes;
  readonly localKeysProtectionSalt: RandomBytes;
  readonly devicePublicSignKey: DevicePublicSignKey;
  readonly devicePublicVaultKey: DeviceVaultPublicKey;
  readonly protectedLocalKeys: SerializedWrapped<LocalKeysPayload>;
};
