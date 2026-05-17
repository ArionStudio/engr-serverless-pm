import type { RandomBytes } from "../crypto/brand-keys";
import type { SerializedWrapped } from "../crypto/protected-artifact";
import type { LocalKeysPayload } from "../local-protection/local-protection.type";
import type { DevicePublicSignKey } from "./brand-keys";

export type DeviceAccessMaterial = {
  readonly vaultId: string;
  readonly deviceId: string;
  readonly algorithmSuiteId: string;
  readonly masterPasswordSalt: RandomBytes;
  readonly localKeysProtectionSalt: RandomBytes;
  readonly devicePublicSignKey: DevicePublicSignKey;
  readonly protectedLocalKeys: SerializedWrapped<LocalKeysPayload>;
};
