import {
  ChangedDeviceKeySlotsError,
  InvalidVaultSyncReviewError,
} from "../../errors";
import { areJsonEqual } from "../common";
import type { DeviceKeySlot } from "../snapshot";
import type {
  ChangedDeviceKeySlot,
  KeySlotDeviceSlotsChanges,
  KeySlotReviewItem,
} from "./key-slot-review.type";

export function findChangesInKeySlots(
  localKeySlots: { readonly deviceSlots: readonly DeviceKeySlot[] },
  remoteKeySlots: { readonly deviceSlots: readonly DeviceKeySlot[] },
): KeySlotReviewItem {
  const deviceSlots = findDeviceSlotChanges(
    localKeySlots.deviceSlots,
    remoteKeySlots.deviceSlots,
  );

  if (deviceSlots.changedDeviceIds.length > 0) {
    throw new ChangedDeviceKeySlotsError(
      findChangedDeviceSlotsDetails(
        localKeySlots.deviceSlots,
        remoteKeySlots.deviceSlots,
        deviceSlots.changedDeviceIds,
      ),
    );
  }

  return {
    deviceSlots,
    hasChanges:
      deviceSlots.addedDeviceIds.length > 0 ||
      deviceSlots.removedDeviceIds.length > 0,
  };
}

function findDeviceSlotChanges(
  localDeviceSlots: readonly DeviceKeySlot[],
  remoteDeviceSlots: readonly DeviceKeySlot[],
): KeySlotDeviceSlotsChanges {
  const localById = createDeviceSlotMap(localDeviceSlots);
  const remoteById = createDeviceSlotMap(remoteDeviceSlots);
  const addedDeviceIds: string[] = [];
  const removedDeviceIds: string[] = [];
  const changedDeviceIds: string[] = [];

  for (const deviceId of remoteById.keys()) {
    if (!localById.has(deviceId)) {
      addedDeviceIds.push(deviceId);
    }
  }

  for (const [deviceId, localSlot] of localById) {
    const remoteSlot = remoteById.get(deviceId);

    if (remoteSlot === undefined) {
      removedDeviceIds.push(deviceId);
    } else if (!areJsonEqual(localSlot, remoteSlot)) {
      changedDeviceIds.push(deviceId);
    }
  }

  return { addedDeviceIds, removedDeviceIds, changedDeviceIds };
}

function findChangedDeviceSlotsDetails(
  localDeviceSlots: readonly DeviceKeySlot[],
  remoteDeviceSlots: readonly DeviceKeySlot[],
  changedDeviceIds: readonly string[],
): ChangedDeviceKeySlot[] {
  const localById = createDeviceSlotMap(localDeviceSlots);
  const remoteById = createDeviceSlotMap(remoteDeviceSlots);

  return changedDeviceIds.map((deviceId) => {
    const localDeviceSlot = localById.get(deviceId);
    const remoteDeviceSlot = remoteById.get(deviceId);

    if (localDeviceSlot === undefined || remoteDeviceSlot === undefined) {
      throw new InvalidVaultSyncReviewError(
        `Changed device key slot "${deviceId}" is missing from local or remote snapshot.`,
      );
    }

    return { deviceId, localDeviceSlot, remoteDeviceSlot };
  });
}

function createDeviceSlotMap(
  deviceSlots: readonly DeviceKeySlot[],
): Map<string, DeviceKeySlot> {
  const byId = new Map<string, DeviceKeySlot>();

  for (const slot of deviceSlots) {
    if (byId.has(slot.deviceId)) {
      throw new InvalidVaultSyncReviewError(
        `Device key slot "${slot.deviceId}" is duplicated.`,
      );
    }

    byId.set(slot.deviceId, slot);
  }

  return byId;
}
