import { describe, expect, it } from "vitest";
import { DuplicateVaultDeviceProfileError } from "../../errors/vault-device.errors";
import type { Vault } from "./vault";
import {
  addRecoveredDeviceProfileToVault,
  removeOtherDeviceProfilesFromVault,
  resetDeviceProfilesToRecoveredDevice,
  revokeDeviceProfileFromVault,
} from "./vault-device.mutations";

function createVault(): Vault {
  return {
    versionVector: { A: 7 },
    entries: [],
    deletedEntries: [],
    deviceProfiles: [],
    deletedDeviceProfiles: [],
    tags: [],
    deletedTags: [],
  };
}

describe("vault device mutation utils", () => {
  it("adds a recovered device profile and increments the vault vector", () => {
    expect(
      addRecoveredDeviceProfileToVault(
        createVault(),
        "recovered-device-id",
        "Recovered laptop",
        1,
      ),
    ).toEqual({
      ...createVault(),
      versionVector: { A: 7, "recovered-device-id": 1 },
      deviceProfiles: [
        {
          id: "recovered-device-id",
          name: "Recovered laptop",
          createdAt: 1,
          versionVector: {
            "recovered-device-id": 1,
          },
        },
      ],
    });
  });

  it("preserves device state when no replaced device identity is known", () => {
    const vault = addRecoveredDeviceProfileToVault(
      {
        ...createVault(),
        deviceProfiles: [
          {
            id: "source-device-id",
            name: "Source laptop",
            createdAt: 1,
            versionVector: { A: 7 },
          },
        ],
        deletedDeviceProfiles: [
          {
            id: "old-device-id",
            versionVector: { B: 2 },
            deletedAt: 1,
          },
        ],
      },
      "recovered-device-id",
      "Recovered laptop",
      2,
    );

    expect(
      vault.deviceProfiles.map((deviceProfile) => deviceProfile.id),
    ).toEqual(["source-device-id", "recovered-device-id"]);
    expect(vault.versionVector).toEqual({ A: 7, "recovered-device-id": 1 });
    expect(vault.deletedDeviceProfiles).toEqual([
      {
        id: "old-device-id",
        versionVector: { B: 2 },
        deletedAt: 1,
      },
    ]);
  });

  it("resets active device profiles to a recovered device", () => {
    const vault = resetDeviceProfilesToRecoveredDevice(
      {
        ...createVault(),
        deviceProfiles: [
          {
            id: "old-device-id",
            name: "Old laptop",
            createdAt: 1,
            versionVector: { A: 7 },
          },
          {
            id: "other-device-id",
            name: "Other laptop",
            createdAt: 1,
            versionVector: { B: 3 },
          },
        ],
        deletedDeviceProfiles: [
          {
            id: "old-device-id",
            versionVector: { A: 6 },
            deletedAt: 1,
          },
          {
            id: "previous-device-id",
            versionVector: { C: 2 },
            deletedAt: 1,
          },
        ],
      },
      "recovered-device-id",
      "Recovered laptop",
      2,
    );

    expect(
      vault.deviceProfiles.map((deviceProfile) => deviceProfile.id),
    ).toEqual(["recovered-device-id"]);
    expect(vault.versionVector).toEqual({ A: 7, "recovered-device-id": 1 });
    expect(vault.deletedDeviceProfiles).toEqual([
      {
        id: "previous-device-id",
        versionVector: { C: 2 },
        deletedAt: 1,
      },
      {
        id: "old-device-id",
        versionVector: { A: 7, "recovered-device-id": 1 },
        deletedAt: 2,
      },
      {
        id: "other-device-id",
        versionVector: { B: 3, "recovered-device-id": 1 },
        deletedAt: 2,
      },
    ]);
  });

  it("preserves device state when appending a recovered profile", () => {
    const vault = addRecoveredDeviceProfileToVault(
      {
        ...createVault(),
        deviceProfiles: [
          {
            id: "source-device-id",
            name: "Source laptop",
            createdAt: 1,
            versionVector: { A: 7 },
          },
        ],
      },
      "recovered-device-id",
      "Recovered laptop",
      2,
    );

    expect(
      vault.deviceProfiles.map((deviceProfile) => deviceProfile.id),
    ).toEqual(["source-device-id", "recovered-device-id"]);
    expect(vault.versionVector).toEqual({ A: 7, "recovered-device-id": 1 });
    expect(vault.deletedDeviceProfiles).toEqual([]);
  });

  it("rejects an active recovered device profile duplicate", () => {
    expect(() =>
      addRecoveredDeviceProfileToVault(
        {
          ...createVault(),
          deviceProfiles: [
            {
              id: "recovered-device-id",
              name: "Existing laptop",
              createdAt: 1,
              versionVector: { A: 7 },
            },
          ],
        },
        "recovered-device-id",
        "Recovered laptop",
        2,
      ),
    ).toThrow(DuplicateVaultDeviceProfileError);
  });

  it("rejects a deleted recovered device profile duplicate", () => {
    expect(() =>
      addRecoveredDeviceProfileToVault(
        {
          ...createVault(),
          deletedDeviceProfiles: [
            {
              id: "recovered-device-id",
              versionVector: { A: 7 },
              deletedAt: 1,
            },
          ],
        },
        "recovered-device-id",
        "Recovered laptop",
        2,
      ),
    ).toThrow(DuplicateVaultDeviceProfileError);
  });

  it("rejects an active recovered device profile duplicate during reset", () => {
    expect(() =>
      resetDeviceProfilesToRecoveredDevice(
        {
          ...createVault(),
          deviceProfiles: [
            {
              id: "recovered-device-id",
              name: "Existing laptop",
              createdAt: 1,
              versionVector: { A: 7 },
            },
          ],
        },
        "recovered-device-id",
        "Recovered laptop",
        2,
      ),
    ).toThrow(DuplicateVaultDeviceProfileError);
  });

  it("removes other active device profiles and keeps the current profile", () => {
    const vault = removeOtherDeviceProfilesFromVault(
      {
        ...createVault(),
        versionVector: { A: 7, "current-device-id": 2 },
        deviceProfiles: [
          {
            id: "current-device-id",
            name: "Current laptop",
            createdAt: 1,
            versionVector: { "current-device-id": 2 },
          },
          {
            id: "other-device-id",
            name: "Other laptop",
            createdAt: 1,
            versionVector: { B: 3 },
          },
        ],
        deletedDeviceProfiles: [
          {
            id: "other-device-id",
            versionVector: { B: 2 },
            deletedAt: 1,
          },
          {
            id: "previous-device-id",
            versionVector: { C: 2 },
            deletedAt: 1,
          },
        ],
      },
      "current-device-id",
      2,
    );

    expect(
      vault.deviceProfiles.map((deviceProfile) => deviceProfile.id),
    ).toEqual(["current-device-id"]);
    expect(vault.versionVector).toEqual({ A: 7, "current-device-id": 3 });
    expect(vault.deletedDeviceProfiles).toEqual([
      {
        id: "previous-device-id",
        versionVector: { C: 2 },
        deletedAt: 1,
      },
      {
        id: "other-device-id",
        versionVector: { B: 3, "current-device-id": 1 },
        deletedAt: 2,
      },
    ]);
  });

  it("preserves vault state when there are no other active devices", () => {
    const vault: Vault = {
      ...createVault(),
      deviceProfiles: [
        {
          id: "current-device-id",
          name: "Current laptop",
          createdAt: 1,
          versionVector: { "current-device-id": 1 },
        },
      ],
    };

    expect(
      removeOtherDeviceProfilesFromVault(vault, "current-device-id", 2),
    ).toBe(vault);
  });

  it("preserves vault state when the current device profile is missing", () => {
    const vault = createVault();

    expect(
      removeOtherDeviceProfilesFromVault(vault, "missing-device-id", 2),
    ).toBe(vault);
  });

  it("tombstones a revoked device profile and increments the vault vector", () => {
    const vault = revokeDeviceProfileFromVault(
      {
        ...createVault(),
        versionVector: { A: 7, "revoked-device-id": 1 },
        deviceProfiles: [
          {
            id: "source-device-id",
            name: "Source laptop",
            createdAt: 1,
            versionVector: { A: 7 },
          },
          {
            id: "revoked-device-id",
            name: "Revoked laptop",
            createdAt: 1,
            versionVector: { "revoked-device-id": 1 },
          },
        ],
      },
      "source-device-id",
      "revoked-device-id",
      2,
    );

    expect(
      vault.deviceProfiles.map((deviceProfile) => deviceProfile.id),
    ).toEqual(["source-device-id"]);
    expect(vault.versionVector).toEqual({
      A: 7,
      "revoked-device-id": 1,
      "source-device-id": 1,
    });
    expect(vault.deletedDeviceProfiles).toEqual([
      {
        id: "revoked-device-id",
        versionVector: {
          "revoked-device-id": 1,
          "source-device-id": 1,
        },
        deletedAt: 2,
      },
    ]);
  });

  it("preserves vault state when the revoked device profile is missing", () => {
    const vault = createVault();

    expect(
      revokeDeviceProfileFromVault(
        vault,
        "source-device-id",
        "missing-device-id",
        2,
      ),
    ).toBe(vault);
  });
});
