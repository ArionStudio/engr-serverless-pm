import {
  ChangedDeviceKeySlotsError,
  InvalidVaultSyncReviewError,
} from "../../errors";
import { areJsonEqual } from "../common";
import type {
  DeviceKeySlot,
  EnrollmentKeySlot,
  RecoveryKeySlot,
} from "../snapshot";
import type {
  ChangedDeviceKeySlot,
  KeySlotDeviceSlotsChanges,
  KeySlotEnrollmentSlotState,
  KeySlotRecoverySlotState,
  KeySlotReviewItem,
} from "./key-slot-review.type";

type ReviewableKeySlots = {
  readonly deviceSlots: readonly DeviceKeySlot[];
  readonly recoveryKeySlot: RecoveryKeySlot;
  readonly enrollmentKeySlot?: EnrollmentKeySlot;
};

export function findChangesInKeySlots(
  localKeySlots: ReviewableKeySlots,
  remoteKeySlots: ReviewableKeySlots,
): KeySlotReviewItem {
  const deviceSlots = findDeviceSlotChanges(
    localKeySlots.deviceSlots,
    remoteKeySlots.deviceSlots,
  );
  const recoveryKeySlot = findRecoveryKeySlotState(
    localKeySlots.recoveryKeySlot,
    remoteKeySlots.recoveryKeySlot,
  );
  const enrollmentKeySlot = findEnrollmentKeySlotState(
    localKeySlots.enrollmentKeySlot,
    remoteKeySlots.enrollmentKeySlot,
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

  if (enrollmentKeySlot === "changed") {
    throw new InvalidVaultSyncReviewError(
      "Broken vault state: enrollment key slot changed between local and remote snapshots.",
    );
  }

  return {
    deviceSlots,
    recoveryKeySlot,
    enrollmentKeySlot,
    hasChanges:
      deviceSlots.addedDeviceIds.length > 0 ||
      deviceSlots.removedDeviceIds.length > 0 ||
      recoveryKeySlot === "changed" ||
      enrollmentKeySlot === "existing",
  };
}

function findDeviceSlotChanges(
  localDeviceSlots: readonly DeviceKeySlot[],
  remoteDeviceSlots: readonly DeviceKeySlot[],
): KeySlotDeviceSlotsChanges {
  const localDeviceSlotById = createDeviceSlotMap(localDeviceSlots);
  const remoteDeviceSlotById = createDeviceSlotMap(remoteDeviceSlots);
  const addedDeviceIds: string[] = [];
  const removedDeviceIds: string[] = [];
  const changedDeviceIds: string[] = [];

  for (const deviceId of remoteDeviceSlotById.keys()) {
    if (!localDeviceSlotById.has(deviceId)) {
      addedDeviceIds.push(deviceId);
    }
  }

  for (const deviceId of localDeviceSlotById.keys()) {
    const localDeviceSlot = localDeviceSlotById.get(deviceId);
    const remoteDeviceSlot = remoteDeviceSlotById.get(deviceId);

    if (localDeviceSlot === undefined) {
      continue;
    }

    if (remoteDeviceSlot === undefined) {
      removedDeviceIds.push(deviceId);
      continue;
    }

    if (
      !areJsonEqual(
        localDeviceSlot.protectedVaultMasterKey,
        remoteDeviceSlot.protectedVaultMasterKey,
      )
    ) {
      changedDeviceIds.push(deviceId);
    }
  }

  return {
    addedDeviceIds,
    removedDeviceIds,
    changedDeviceIds,
  };
}

function findChangedDeviceSlotsDetails(
  localDeviceSlots: readonly DeviceKeySlot[],
  remoteDeviceSlots: readonly DeviceKeySlot[],
  changedDeviceIds: readonly string[],
): ChangedDeviceKeySlot[] {
  const localDeviceSlotById = createDeviceSlotMap(localDeviceSlots);
  const remoteDeviceSlotById = createDeviceSlotMap(remoteDeviceSlots);
  const changedDeviceSlots: ChangedDeviceKeySlot[] = [];

  for (const deviceId of changedDeviceIds) {
    const localDeviceSlot = localDeviceSlotById.get(deviceId);
    const remoteDeviceSlot = remoteDeviceSlotById.get(deviceId);

    if (localDeviceSlot === undefined || remoteDeviceSlot === undefined) {
      throw new InvalidVaultSyncReviewError(
        `Changed device key slot "${deviceId}" is missing from local or remote snapshot.`,
      );
    }

    changedDeviceSlots.push({
      deviceId,
      localDeviceSlot,
      remoteDeviceSlot,
    });
  }

  return changedDeviceSlots;
}

function createDeviceSlotMap(
  deviceSlots: readonly DeviceKeySlot[],
): Map<string, DeviceKeySlot> {
  const deviceSlotById = new Map<string, DeviceKeySlot>();

  for (const deviceSlot of deviceSlots) {
    if (deviceSlotById.has(deviceSlot.deviceId)) {
      throw new InvalidVaultSyncReviewError(
        `Device key slot "${deviceSlot.deviceId}" is duplicated.`,
      );
    }

    deviceSlotById.set(deviceSlot.deviceId, deviceSlot);
  }

  return deviceSlotById;
}

function findRecoveryKeySlotState(
  localRecoveryKeySlot: RecoveryKeySlot,
  remoteRecoveryKeySlot: RecoveryKeySlot,
): KeySlotRecoverySlotState {
  return areJsonEqual(localRecoveryKeySlot, remoteRecoveryKeySlot)
    ? "same"
    : "changed";
}

function findEnrollmentKeySlotState(
  localEnrollmentKeySlot: EnrollmentKeySlot | undefined,
  remoteEnrollmentKeySlot: EnrollmentKeySlot | undefined,
): KeySlotEnrollmentSlotState {
  if (
    localEnrollmentKeySlot === undefined &&
    remoteEnrollmentKeySlot === undefined
  ) {
    return "missing";
  }

  if (
    localEnrollmentKeySlot !== undefined &&
    remoteEnrollmentKeySlot !== undefined &&
    areJsonEqual(localEnrollmentKeySlot, remoteEnrollmentKeySlot)
  ) {
    return "existing";
  }

  return "changed";
}
