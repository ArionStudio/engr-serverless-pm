import { describe, expect, it } from "vitest";
import type { DeviceProfile } from "../device/device";
import type { PasswordEntry } from "../entry/password-entry.type";
import type { Tag } from "../entry/tag.type";
import type { Vault } from "../vault/vault";
import {
  applyVaultSyncResolution,
  createVaultSyncReview,
} from "./vault-sync-review.utils";
import type { VaultSyncTrustState } from "./vault-sync-review.type";

function createEntry(
  id: string,
  versionVector: Record<string, number>,
): PasswordEntry {
  return {
    id,
    login: `${id}@example.com`,
    password: `${id}-password`,
    sanitizedUrl: `https://${id}.example.com`,
    tags: [],
    versionVector,
  };
}

function createTag(
  id: number,
  name: string,
  versionVector: Record<string, number>,
): Tag {
  return {
    id,
    name,
    versionVector,
  };
}

function createDeviceProfile(
  id: string,
  name: string,
  versionVector: Record<string, number>,
): DeviceProfile {
  return {
    id,
    name,
    createdAt: new Date(1),
    versionVector,
  };
}

function createVault(overrides: Partial<Vault> = {}): Vault {
  return {
    versionVector: {},
    entries: [],
    deletedEntries: [],
    deviceProfiles: [],
    deletedDeviceProfiles: [],
    tags: [],
    deletedTags: [],
    ...overrides,
  };
}

describe("vault sync review utils", () => {
  it("returns changed entry reviews with preselected decisions but does not merge", () => {
    const localEntry = createEntry("local-entry", { A: 1 });
    const remoteEntry = createEntry("remote-entry", { B: 1 });

    const review = createVaultSyncReview(
      createVault({
        versionVector: { A: 1 },
        entries: [localEntry],
      }),
      createVault({
        versionVector: { A: 1, B: 1 },
        entries: [localEntry, remoteEntry],
      }),
    );

    expect(review).toMatchObject({
      hasChanges: true,
      hasConflicts: false,
      entryReviews: [
        {
          kind: "password_entry",
          entryId: "remote-entry",
          relation: "remote_only",
          conflict: false,
          preselectedAction: "use_remote",
        },
      ],
    });
  });

  it("marks diverged entry updates as conflicts and passes both versions", () => {
    const localEntry = createEntry("entry-id", { A: 2, B: 1 });
    const remoteEntry = createEntry("entry-id", { A: 1, B: 2 });

    const review = createVaultSyncReview(
      createVault({ entries: [localEntry] }),
      createVault({ entries: [remoteEntry] }),
    );

    expect(review.hasConflicts).toBe(true);
    expect(review.entryReviews).toEqual([
      {
        kind: "password_entry",
        entryId: "entry-id",
        relation: "diverged",
        conflict: true,
        preselectedAction: "use_local",
        localState: {
          kind: "entry",
          entry: localEntry,
        },
        remoteState: {
          kind: "entry",
          entry: remoteEntry,
        },
      },
    ]);
  });

  it("reviews tags, device profiles, and trust changes without applying them", () => {
    const localTag = createTag(1, "Local", { A: 1 });
    const remoteTag = createTag(2, "Remote", { B: 1 });
    const localDeviceProfile = createDeviceProfile("device-a", "A", { A: 1 });
    const remoteDeviceProfile = createDeviceProfile("device-b", "B", {
      B: 1,
    });
    const localTrustState: VaultSyncTrustState = {
      trustedDevices: [],
      keySlots: {
        deviceSlots: [],
        recoveryKeySlot: {
          protectedVaultMasterKey: {
            wrappedKey: "local" as never,
            wrappingNonce: "local" as never,
          },
        },
      },
    };
    const remoteTrustState: VaultSyncTrustState = {
      trustedDevices: [
        {
          id: "device-b",
          publicKeys: {
            signingKey: new ArrayBuffer(1) as never,
          },
        },
      ],
      keySlots: {
        deviceSlots: [],
        recoveryKeySlot: {
          protectedVaultMasterKey: {
            wrappedKey: "remote" as never,
            wrappingNonce: "remote" as never,
          },
        },
      },
    };

    const review = createVaultSyncReview(
      createVault({
        versionVector: { A: 1 },
        tags: [localTag],
        deviceProfiles: [localDeviceProfile],
      }),
      createVault({
        versionVector: { A: 1, B: 1 },
        tags: [remoteTag],
        deviceProfiles: [remoteDeviceProfile],
      }),
      localTrustState,
      remoteTrustState,
    );

    expect(review.tagReviews).toMatchObject([
      {
        kind: "tag",
        tagId: 1,
        relation: "local_only",
        conflict: false,
        preselectedAction: "use_local",
      },
      {
        kind: "tag",
        tagId: 2,
        relation: "remote_only",
        conflict: false,
        preselectedAction: "use_remote",
      },
    ]);
    expect(review.deviceProfileReviews).toMatchObject([
      {
        kind: "device_profile",
        deviceId: "device-a",
        relation: "local_only",
        conflict: false,
        preselectedAction: "use_local",
      },
      {
        kind: "device_profile",
        deviceId: "device-b",
        relation: "remote_only",
        conflict: false,
        preselectedAction: "use_remote",
      },
    ]);
    expect(review.trustReview).toMatchObject({
      kind: "device_trust",
      informational: true,
      localTrustState,
      remoteTrustState,
    });
  });

  it("applies only explicit resolutions and stamps the resolved local event", () => {
    const localEntry = createEntry("entry-id", { A: 2, B: 1 });
    const remoteEntry = {
      ...createEntry("entry-id", { A: 1, B: 2 }),
      login: "remote@example.com",
    };
    const remoteTag = createTag(2, "Remote", { B: 2 });

    const vault = applyVaultSyncResolution(
      createVault({
        versionVector: { A: 2, B: 1 },
        entries: [localEntry],
        tags: [],
      }),
      createVault({
        versionVector: { A: 1, B: 2 },
        entries: [remoteEntry],
        tags: [remoteTag],
      }),
      {
        entryResolutions: [
          {
            kind: "password_entry",
            entryId: "entry-id",
            action: "use_remote",
          },
        ],
        tagResolutions: [
          {
            kind: "tag",
            tagId: 2,
            action: "use_remote",
          },
        ],
        deviceProfileResolutions: [],
      },
      "A",
    );

    expect(vault.versionVector).toEqual({ A: 3, B: 2 });
    expect(vault.entries).toEqual([
      {
        ...remoteEntry,
        versionVector: { A: 3, B: 2 },
      },
    ]);
    expect(vault.tags).toEqual([
      {
        ...remoteTag,
        versionVector: { A: 1, B: 2 },
      },
    ]);
  });

  it("applies tag and device profile tombstone resolutions", () => {
    const localTag = createTag(1, "Local", { A: 2 });
    const remoteDeletedTag = {
      id: 1,
      deletedAt: 10,
      versionVector: { A: 1, B: 1 },
    };
    const localDeviceProfile = createDeviceProfile("device-a", "A", { A: 2 });
    const remoteDeletedDeviceProfile = {
      id: "device-a",
      deletedAt: 11,
      versionVector: { A: 1, B: 1 },
    };

    const vault = applyVaultSyncResolution(
      createVault({
        versionVector: { A: 2 },
        tags: [localTag],
        deviceProfiles: [localDeviceProfile],
      }),
      createVault({
        versionVector: { A: 1, B: 1 },
        deletedTags: [remoteDeletedTag],
        deletedDeviceProfiles: [remoteDeletedDeviceProfile],
      }),
      {
        entryResolutions: [],
        tagResolutions: [
          {
            kind: "tag",
            tagId: 1,
            action: "use_remote",
          },
        ],
        deviceProfileResolutions: [
          {
            kind: "device_profile",
            deviceId: "device-a",
            action: "use_remote",
          },
        ],
      },
      "A",
    );

    expect(vault.tags).toEqual([]);
    expect(vault.deletedTags).toEqual([
      {
        ...remoteDeletedTag,
        versionVector: { A: 3, B: 1 },
      },
    ]);
    expect(vault.deviceProfiles).toEqual([]);
    expect(vault.deletedDeviceProfiles).toEqual([
      {
        ...remoteDeletedDeviceProfile,
        versionVector: { A: 3, B: 1 },
      },
    ]);
  });

  it("requires every changed entry to be resolved", () => {
    expect(() =>
      applyVaultSyncResolution(
        createVault({ entries: [createEntry("entry-id", { A: 1 })] }),
        createVault({ entries: [createEntry("entry-id", { A: 2 })] }),
        {
          entryResolutions: [],
          tagResolutions: [],
          deviceProfileResolutions: [],
        },
        "A",
      ),
    ).toThrow('Entry "entry-id" must have a sync resolution.');
  });
});
