import type { Brand } from "../common/brand-keys";
import type {
  DeviceLocalProtectionKey,
  DevicePrivateSignKey,
  DeviceVaultPrivateKey,
} from "./brand-keys";
import type { LocalVaultTrustAnchor } from "./vault-trust";

export type LocalRootKey = Brand<ArrayBuffer, "LocalRootKey">;

export type LocalKeysPayload = {
  readonly devicePrivateSignKey: DevicePrivateSignKey;
  readonly devicePrivateVaultKey: DeviceVaultPrivateKey;
  readonly deviceLocalProtectionKey: DeviceLocalProtectionKey;
  readonly vaultTrustAnchor: LocalVaultTrustAnchor;
};
