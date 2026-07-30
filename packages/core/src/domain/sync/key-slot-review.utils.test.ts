import { describe, expect, it } from "vitest";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import { ChangedDeviceKeySlotsError } from "../../errors";
import type { DeviceKeySlot } from "../snapshot";
import { findChangesInKeySlots } from "./key-slot-review.utils";

function createSlot(deviceId: string): DeviceKeySlot {
  const values = createCoreTestValues();

  return {
    deviceId,
    vaultKeyGeneration: 1,
    envelope: {
      ...values.vaultKeyEnvelope,
      recipientDeviceId: deviceId,
    },
  };
}

describe("findChangesInKeySlots", () => {
  it("reports unchanged slots", () => {
    const slot = createSlot("device-id");

    expect(
      findChangesInKeySlots({ deviceSlots: [slot] }, { deviceSlots: [slot] }),
    ).toEqual({
      deviceSlots: {
        addedDeviceIds: [],
        removedDeviceIds: [],
        changedDeviceIds: [],
      },
      hasChanges: false,
    });
  });

  it("reports added and removed recipients", () => {
    expect(
      findChangesInKeySlots(
        { deviceSlots: [createSlot("removed")] },
        { deviceSlots: [createSlot("added")] },
      ),
    ).toEqual({
      deviceSlots: {
        addedDeviceIds: ["added"],
        removedDeviceIds: ["removed"],
        changedDeviceIds: [],
      },
      hasChanges: true,
    });
  });

  it("rejects a changed envelope for an existing recipient", () => {
    const local = createSlot("device-id");
    const remote = {
      ...local,
      vaultKeyGeneration: 2,
      envelope: {
        ...local.envelope,
        vaultKeyGeneration: 2,
      },
    };

    expect(() =>
      findChangesInKeySlots(
        { deviceSlots: [local] },
        { deviceSlots: [remote] },
      ),
    ).toThrow(ChangedDeviceKeySlotsError);
  });
});
