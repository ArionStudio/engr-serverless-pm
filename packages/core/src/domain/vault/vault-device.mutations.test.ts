import { describe, expect, it } from "vitest";
import { DuplicateVaultDeviceProfileError } from "../../errors/vault-device.errors";
import type { Vault } from "./vault";
import {
  addRecoveredDeviceProfileToVault,
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
        null,
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
      null,
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

  it("tombstones a replaced local device profile when recovering access", () => {
    const vault = addRecoveredDeviceProfileToVault(
      {
        ...createVault(),
        deviceProfiles: [
          {
            id: "old-device-id",
            name: "Old laptop",
            createdAt: 1,
            versionVector: { A: 7 },
          },
        ],
      },
      "recovered-device-id",
      "Recovered laptop",
      2,
      "old-device-id",
    );

    expect(
      vault.deviceProfiles.map((deviceProfile) => deviceProfile.id),
    ).toEqual(["recovered-device-id"]);
    expect(vault.versionVector).toEqual({ A: 7, "recovered-device-id": 1 });
    expect(vault.deletedDeviceProfiles).toEqual([
      {
        id: "old-device-id",
        versionVector: { A: 7, "recovered-device-id": 1 },
        deletedAt: 2,
      },
    ]);
  });

  it("preserves device state when the replaced device profile is missing", () => {
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
      "missing-device-id",
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
        null,
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
        null,
      ),
    ).toThrow(DuplicateVaultDeviceProfileError);
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
