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
      enrollmentKeySlot === "added" ||
      enrollmentKeySlot === "removed",
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

    if (!areDeviceSlotsEqual(localDeviceSlot, remoteDeviceSlot)) {
      changedDeviceIds.push(deviceId);
    }
  }

  return {
    addedDeviceIds,
    removedDeviceIds,
    changedDeviceIds,
  };
}

function areDeviceSlotsEqual(
  localDeviceSlot: DeviceKeySlot,
  remoteDeviceSlot: DeviceKeySlot,
): boolean {
  return (
    areJsonEqual(
      localDeviceSlot.protectedVaultMasterKey,
      remoteDeviceSlot.protectedVaultMasterKey,
    ) &&
    areArrayBuffersEqual(
      localDeviceSlot.publicSignKey,
      remoteDeviceSlot.publicSignKey,
    )
  );
}

function areArrayBuffersEqual(
  localBuffer: ArrayBuffer,
  remoteBuffer: ArrayBuffer,
): boolean {
  if (localBuffer.byteLength !== remoteBuffer.byteLength) {
    return false;
  }

  const localBytes = new Uint8Array(localBuffer);
  const remoteBytes = new Uint8Array(remoteBuffer);

  for (let index = 0; index < localBytes.length; index += 1) {
    if (localBytes[index] !== remoteBytes[index]) {
      return false;
    }
  }

  return true;
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
  if (areJsonEqual(localRecoveryKeySlot, remoteRecoveryKeySlot)) {
    return "same";
  }

  return "changed";
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
    areEnrollmentKeySlotsEqual(localEnrollmentKeySlot, remoteEnrollmentKeySlot)
  ) {
    return "existing";
  }

  if (localEnrollmentKeySlot === undefined) {
    return "added";
  }

  if (remoteEnrollmentKeySlot === undefined) {
    return "removed";
  }

  return "changed";
}

function areEnrollmentKeySlotsEqual(
  localEnrollmentKeySlot: EnrollmentKeySlot,
  remoteEnrollmentKeySlot: EnrollmentKeySlot,
): boolean {
  return (
    localEnrollmentKeySlot.enrollmentId ===
      remoteEnrollmentKeySlot.enrollmentId &&
    localEnrollmentKeySlot.pendingDeviceId ===
      remoteEnrollmentKeySlot.pendingDeviceId &&
    areArrayBuffersEqual(
      localEnrollmentKeySlot.pendingDevicePublicSignKey,
      remoteEnrollmentKeySlot.pendingDevicePublicSignKey,
    ) &&
    localEnrollmentKeySlot.pendingDevicePublicSignKeyDigest ===
      remoteEnrollmentKeySlot.pendingDevicePublicSignKeyDigest &&
    localEnrollmentKeySlot.protectedVaultMasterKeyDigest ===
      remoteEnrollmentKeySlot.protectedVaultMasterKeyDigest &&
    areJsonEqual(
      localEnrollmentKeySlot.protectedVaultMasterKey,
      remoteEnrollmentKeySlot.protectedVaultMasterKey,
    ) &&
    localEnrollmentKeySlot.authorizedByDeviceId ===
      remoteEnrollmentKeySlot.authorizedByDeviceId &&
    areJsonEqual(
      localEnrollmentKeySlot.authorizerSignature,
      remoteEnrollmentKeySlot.authorizerSignature,
    )
  );
}
