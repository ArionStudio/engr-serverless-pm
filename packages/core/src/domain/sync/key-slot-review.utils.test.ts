import { describe, expect, it } from "vitest";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import { InvalidVaultSyncReviewError } from "../../errors";
import type {
  DeviceKeySlot,
  EnrollmentKeySlot,
  RecoveryKeySlot,
} from "../snapshot";
import { findChangesInKeySlots } from "./key-slot-review.utils";

function createDeviceSlot(): DeviceKeySlot {
  const values = createCoreTestValues();

  return {
    deviceId: values.deviceId,
    protectedVaultMasterKey: values.protectedDeviceVaultMasterKey,
    publicSignKey: values.devicePublicSignKey,
  };
}

function createRecoverySlot(): RecoveryKeySlot {
  const values = createCoreTestValues();

  return {
    protectedVaultMasterKey: values.protectedRecoveryVaultMasterKey,
  };
}

function createEnrollmentSlot(): EnrollmentKeySlot {
  const values = createCoreTestValues();

  return {
    protectedVaultMasterKey: values.protectedEnrollmentVaultMasterKey,
  };
}

describe("findChangesInKeySlots", () => {
  it("does not mark a shared enrollment slot as a key-slot change", () => {
    const deviceSlot = createDeviceSlot();
    const recoveryKeySlot = createRecoverySlot();
    const enrollmentKeySlot = createEnrollmentSlot();

    expect(
      findChangesInKeySlots(
        {
          deviceSlots: [deviceSlot],
          recoveryKeySlot,
          enrollmentKeySlot,
        },
        {
          deviceSlots: [deviceSlot],
          recoveryKeySlot,
          enrollmentKeySlot,
        },
      ),
    ).toEqual({
      deviceSlots: {
        addedDeviceIds: [],
        removedDeviceIds: [],
        changedDeviceIds: [],
      },
      recoveryKeySlot: "same",
      enrollmentKeySlot: "existing",
      hasChanges: false,
    });
  });

  it("marks missing enrollment slots as unchanged", () => {
    const deviceSlot = createDeviceSlot();
    const recoveryKeySlot = createRecoverySlot();

    expect(
      findChangesInKeySlots(
        {
          deviceSlots: [deviceSlot],
          recoveryKeySlot,
        },
        {
          deviceSlots: [deviceSlot],
          recoveryKeySlot,
        },
      ).hasChanges,
    ).toBe(false);
  });

  it("marks changed recovery slot content as key-slot changes", () => {
    const values = createCoreTestValues();
    const deviceSlot = createDeviceSlot();

    expect(
      findChangesInKeySlots(
        {
          deviceSlots: [deviceSlot],
          recoveryKeySlot: createRecoverySlot(),
        },
        {
          deviceSlots: [deviceSlot],
          recoveryKeySlot: {
            protectedVaultMasterKey: values.protectedEnrollmentVaultMasterKey,
          },
        },
      ),
    ).toEqual({
      deviceSlots: {
        addedDeviceIds: [],
        removedDeviceIds: [],
        changedDeviceIds: [],
      },
      recoveryKeySlot: "changed",
      enrollmentKeySlot: "missing",
      hasChanges: true,
    });
  });

  it("marks added enrollment slots as key-slot changes", () => {
    const deviceSlot = createDeviceSlot();
    const recoveryKeySlot = createRecoverySlot();

    expect(
      findChangesInKeySlots(
        {
          deviceSlots: [deviceSlot],
          recoveryKeySlot,
        },
        {
          deviceSlots: [deviceSlot],
          recoveryKeySlot,
          enrollmentKeySlot: createEnrollmentSlot(),
        },
      ),
    ).toEqual({
      deviceSlots: {
        addedDeviceIds: [],
        removedDeviceIds: [],
        changedDeviceIds: [],
      },
      recoveryKeySlot: "same",
      enrollmentKeySlot: "added",
      hasChanges: true,
    });
  });

  it("marks removed enrollment slots as key-slot changes", () => {
    const deviceSlot = createDeviceSlot();
    const recoveryKeySlot = createRecoverySlot();

    expect(
      findChangesInKeySlots(
        {
          deviceSlots: [deviceSlot],
          recoveryKeySlot,
          enrollmentKeySlot: createEnrollmentSlot(),
        },
        {
          deviceSlots: [deviceSlot],
          recoveryKeySlot,
        },
      ),
    ).toEqual({
      deviceSlots: {
        addedDeviceIds: [],
        removedDeviceIds: [],
        changedDeviceIds: [],
      },
      recoveryKeySlot: "same",
      enrollmentKeySlot: "removed",
      hasChanges: true,
    });
  });

  it("rejects changed enrollment slot content as a broken vault state", () => {
    const values = createCoreTestValues();
    const deviceSlot = createDeviceSlot();
    const recoveryKeySlot = createRecoverySlot();

    expect(() =>
      findChangesInKeySlots(
        {
          deviceSlots: [deviceSlot],
          recoveryKeySlot,
          enrollmentKeySlot: createEnrollmentSlot(),
        },
        {
          deviceSlots: [deviceSlot],
          recoveryKeySlot,
          enrollmentKeySlot: {
            protectedVaultMasterKey: values.protectedDeviceVaultMasterKey,
          },
        },
      ),
    ).toThrow(InvalidVaultSyncReviewError);
  });

  it("marks device additions and recovery-slot updates as key-slot changes", () => {
    const values = createCoreTestValues();
    const deviceSlot = createDeviceSlot();
    const addedDeviceSlot: DeviceKeySlot = {
      deviceId: "other-device-id",
      protectedVaultMasterKey: values.protectedDeviceVaultMasterKey,
      publicSignKey: values.devicePublicSignKey,
    };

    const result = findChangesInKeySlots(
      {
        deviceSlots: [deviceSlot],
        recoveryKeySlot: createRecoverySlot(),
      },
      {
        deviceSlots: [deviceSlot, addedDeviceSlot],
        recoveryKeySlot: {
          protectedVaultMasterKey: values.protectedEnrollmentVaultMasterKey,
        },
      },
    );

    expect(result).toEqual({
      deviceSlots: {
        addedDeviceIds: ["other-device-id"],
        removedDeviceIds: [],
        changedDeviceIds: [],
      },
      recoveryKeySlot: "changed",
      enrollmentKeySlot: "missing",
      hasChanges: true,
    });
  });
});
