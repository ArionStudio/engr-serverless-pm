import { describe, expect, it } from "vitest";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import {
  ChangedDeviceKeySlotsError,
  InvalidVaultSyncReviewError,
} from "../../errors";
import type { DevicePublicSignKey } from "../device-trust";
import type { DeviceKeySlot, EnrollmentKeySlot } from "../snapshot";
import { findChangesInKeySlots } from "./key-slot-review.utils";

function createDeviceSlot(): DeviceKeySlot {
  const values = createCoreTestValues();

  return {
    deviceId: values.deviceId,
    protectedVaultMasterKey: values.protectedDeviceVaultMasterKey,
    publicSignKey: values.devicePublicSignKey,
  };
}

function createEnrollmentSlot(): EnrollmentKeySlot {
  const values = createCoreTestValues();

  return {
    enrollmentId: values.enrollmentId,
    pendingDeviceId: values.pendingDeviceId,
    pendingDevicePublicSignKey: values.pendingDevicePublicSignKey,
    pendingDevicePublicSignKeyDigest: values.pendingDevicePublicSignKeyDigest,
    protectedVaultMasterKeyDigest:
      values.protectedEnrollmentVaultMasterKeyDigest,
    protectedVaultMasterKey: values.protectedEnrollmentVaultMasterKey,
    authorizedByDeviceId: values.deviceId,
    authorizerSignature: values.deviceEnrollmentAuthorizationSignature,
  };
}

describe("findChangesInKeySlots", () => {
  it("does not mark a shared enrollment slot as a key-slot change", () => {
    const deviceSlot = createDeviceSlot();
    const enrollmentKeySlot = createEnrollmentSlot();

    expect(
      findChangesInKeySlots(
        {
          deviceSlots: [deviceSlot],
          enrollmentKeySlot,
        },
        {
          deviceSlots: [deviceSlot],
          enrollmentKeySlot,
        },
      ),
    ).toEqual({
      deviceSlots: {
        addedDeviceIds: [],
        removedDeviceIds: [],
        changedDeviceIds: [],
      },
      enrollmentKeySlot: "existing",
      hasChanges: false,
    });
  });

  it("marks missing enrollment slots as unchanged", () => {
    const deviceSlot = createDeviceSlot();

    expect(
      findChangesInKeySlots(
        {
          deviceSlots: [deviceSlot],
        },
        {
          deviceSlots: [deviceSlot],
        },
      ).hasChanges,
    ).toBe(false);
  });

  it("marks added enrollment slots as key-slot changes", () => {
    const deviceSlot = createDeviceSlot();

    expect(
      findChangesInKeySlots(
        {
          deviceSlots: [deviceSlot],
        },
        {
          deviceSlots: [deviceSlot],
          enrollmentKeySlot: createEnrollmentSlot(),
        },
      ),
    ).toEqual({
      deviceSlots: {
        addedDeviceIds: [],
        removedDeviceIds: [],
        changedDeviceIds: [],
      },
      enrollmentKeySlot: "added",
      hasChanges: true,
    });
  });

  it("marks removed enrollment slots as key-slot changes", () => {
    const deviceSlot = createDeviceSlot();

    expect(
      findChangesInKeySlots(
        {
          deviceSlots: [deviceSlot],
          enrollmentKeySlot: createEnrollmentSlot(),
        },
        {
          deviceSlots: [deviceSlot],
        },
      ),
    ).toEqual({
      deviceSlots: {
        addedDeviceIds: [],
        removedDeviceIds: [],
        changedDeviceIds: [],
      },
      enrollmentKeySlot: "removed",
      hasChanges: true,
    });
  });

  it("rejects changed enrollment slot content as a broken vault state", () => {
    const values = createCoreTestValues();
    const deviceSlot = createDeviceSlot();

    expect(() =>
      findChangesInKeySlots(
        {
          deviceSlots: [deviceSlot],
          enrollmentKeySlot: createEnrollmentSlot(),
        },
        {
          deviceSlots: [deviceSlot],
          enrollmentKeySlot: {
            ...createEnrollmentSlot(),
            protectedVaultMasterKey: values.protectedDeviceVaultMasterKey,
          },
        },
      ),
    ).toThrow(InvalidVaultSyncReviewError);
  });

  it("rejects changed enrollment pending public keys as a broken vault state", () => {
    const deviceSlot = createDeviceSlot();

    expect(() =>
      findChangesInKeySlots(
        {
          deviceSlots: [deviceSlot],
          enrollmentKeySlot: createEnrollmentSlot(),
        },
        {
          deviceSlots: [deviceSlot],
          enrollmentKeySlot: {
            ...createEnrollmentSlot(),
            pendingDevicePublicSignKey: new Uint8Array([1, 2])
              .buffer as DevicePublicSignKey,
          },
        },
      ),
    ).toThrow(InvalidVaultSyncReviewError);
  });

  it("rejects changed device signing public keys as device key-slot changes", () => {
    const deviceSlot = createDeviceSlot();
    const remoteDeviceSlot: DeviceKeySlot = {
      ...deviceSlot,
      publicSignKey: new Uint8Array([1, 2]).buffer as DevicePublicSignKey,
    };

    expect(() =>
      findChangesInKeySlots(
        {
          deviceSlots: [deviceSlot],
        },
        {
          deviceSlots: [remoteDeviceSlot],
        },
      ),
    ).toThrow(ChangedDeviceKeySlotsError);
  });

  it("marks device additions as key-slot changes", () => {
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
      },
      {
        deviceSlots: [deviceSlot, addedDeviceSlot],
      },
    );

    expect(result).toEqual({
      deviceSlots: {
        addedDeviceIds: ["other-device-id"],
        removedDeviceIds: [],
        changedDeviceIds: [],
      },
      enrollmentKeySlot: "missing",
      hasChanges: true,
    });
  });
});
