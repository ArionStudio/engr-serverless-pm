import type { Brand } from "../common/brand-keys";

export type DevicePublicSignKey = Brand<ArrayBuffer, "PublicDeviceSignKey">;
export type DevicePrivateSignKey = Brand<ArrayBuffer, "PrivateDeviceSignKey">;
export type DeviceVaultPublicKey = Brand<ArrayBuffer, "DeviceVaultPublicKey">;
export type DeviceVaultPrivateKey = Brand<ArrayBuffer, "DeviceVaultPrivateKey">;
export type DeviceLocalProtectionKey = Brand<
  ArrayBuffer,
  "DeviceLocalProtectionKey"
>;

export type DeviceSignKeyPair = {
  readonly publicKey: DevicePublicSignKey;
  readonly privateKey: DevicePrivateSignKey;
};

export type DeviceVaultKeyPair = {
  readonly publicKey: DeviceVaultPublicKey;
  readonly privateKey: DeviceVaultPrivateKey;
};
