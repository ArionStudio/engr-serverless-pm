import { describe, expect, it } from "vitest";
import { b64, createCoreTestValues } from "../../__tests__/fixtures/values";
import type { RandomBytes } from "../crypto/brand-keys";
import type { DeviceVaultPublicKey } from "../device-trust";
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

  it.each([
    {
      name: "ephemeral public key",
      changeEnvelope: (slot: DeviceKeySlot): DeviceKeySlot["envelope"] => ({
        ...slot.envelope,
        ephemeralPublicKey: new Uint8Array([1]).buffer as DeviceVaultPublicKey,
      }),
    },
    {
      name: "HKDF salt",
      changeEnvelope: (slot: DeviceKeySlot): DeviceKeySlot["envelope"] => ({
        ...slot.envelope,
        hkdfSalt: new Uint8Array([1]).buffer as RandomBytes,
      }),
    },
    {
      name: "encrypted vault master key",
      changeEnvelope: (slot: DeviceKeySlot): DeviceKeySlot["envelope"] => ({
        ...slot.envelope,
        encryptedVaultMasterKey: {
          ...slot.envelope.encryptedVaultMasterKey,
          ciphertext: b64("changed-encrypted-vault-master-key"),
        },
      }),
    },
  ])("rejects a changed $name", ({ changeEnvelope }) => {
    const local = createSlot("device-id");
    const remote = {
      ...local,
      envelope: changeEnvelope(local),
    };

    expect(() =>
      findChangesInKeySlots(
        { deviceSlots: [local] },
        { deviceSlots: [remote] },
      ),
    ).toThrow(ChangedDeviceKeySlotsError);
  });
});
