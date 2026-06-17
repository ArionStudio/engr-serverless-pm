import type { Brand } from "../common/brand-keys";

export type DeviceSlotKey = Brand<ArrayBuffer, "DeviceSlotKey">;
export type DeviceEnrollmentSecret = Brand<
  ArrayBuffer,
  "DeviceEnrollmentSecret"
>;

export type DevicePublicSignKey = Brand<ArrayBuffer, "PublicDeviceSignKey">;
export type DevicePrivateSignKey = Brand<ArrayBuffer, "PrivateDeviceSignKey">;

export type DeviceSignKeyPair = {
  publicKey: DevicePublicSignKey;
  privateKey: DevicePrivateSignKey;
};
