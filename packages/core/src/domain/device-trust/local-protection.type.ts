import type { Brand } from "../common/brand-keys";
import type { DevicePrivateSignKey, DeviceSlotKey } from "./brand-keys";

export type LocalRootKey = Brand<ArrayBuffer, "LocalRootKey">;

export type LocalKeysPayload = {
  readonly deviceSlotKey: DeviceSlotKey;
  readonly devicePrivateSignKey: DevicePrivateSignKey;
};
