import type { Brand } from "../common/brand-keys";
import type { DevicePrivateSignKey, DeviceSlotKey } from "./brand-keys";
import type { LocalVaultTrustAnchor } from "./vault-trust";

export type LocalRootKey = Brand<ArrayBuffer, "LocalRootKey">;

export type LocalKeysPayload = {
  readonly deviceSlotKey: DeviceSlotKey;
  readonly devicePrivateSignKey: DevicePrivateSignKey;
  readonly vaultTrustAnchor: LocalVaultTrustAnchor;
};
