import type { DeviceKeySlot } from "../snapshot";

export type KeySlotDeviceSlotsChanges = {
  readonly addedDeviceIds: readonly string[];
  readonly removedDeviceIds: readonly string[];
  readonly changedDeviceIds: readonly string[];
};

export type ChangedDeviceKeySlot = {
  readonly deviceId: string;
  readonly localDeviceSlot: DeviceKeySlot;
  readonly remoteDeviceSlot: DeviceKeySlot;
};

export type KeySlotReviewItem = {
  readonly deviceSlots: KeySlotDeviceSlotsChanges;
  readonly hasChanges: boolean;
};
