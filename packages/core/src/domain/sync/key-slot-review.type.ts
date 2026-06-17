import type { DeviceKeySlot } from "../snapshot";

export type KeySlotEnrollmentSlotState =
  | "missing"
  | "existing"
  | "added"
  | "removed"
  | "changed";
export type KeySlotRecoverySlotState = "same" | "changed";

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
  readonly recoveryKeySlot: KeySlotRecoverySlotState;
  readonly enrollmentKeySlot: KeySlotEnrollmentSlotState;
  readonly hasChanges: boolean;
};
