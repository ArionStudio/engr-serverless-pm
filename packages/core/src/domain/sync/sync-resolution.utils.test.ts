import { describe, expect, it } from "vitest";
import type { DeviceProfile } from "../device-profile";
import type { PasswordEntry } from "../entry/password-entry.type";
import type { Tag } from "../entry/tag.type";
import type { Vault } from "../vault";
import { InvalidVaultSyncResolutionError } from "../../errors/sync.errors";
import type { DeviceProfileReviewItem } from "./device-profile-review.type";
import type { EntryReviewItem } from "./entry-review.type";
import { findChangedEntries } from "./entry-review.utils";
import type { VaultSyncResolution } from "./sync-resolution.type";
import { applyVaultSyncResolution } from "./sync-resolution.utils";
import type { TagReviewItem } from "./tag-review.type";

const resolvingDeviceId = "resolving-device";

function createVault(overrides: Partial<Vault> = {}): Vault {
  return {
    versionVector: { [resolvingDeviceId]: 1 },
    entries: [],
    deletedEntries: [],
    deviceProfiles: [],
    deletedDeviceProfiles: [],
    tags: [],
    deletedTags: [],
    ...overrides,
  };
}

function applyResolution(
  localVault: Vault,
  remoteVault: Vault,
  review: {
    readonly entryReviews: readonly EntryReviewItem[];
    readonly tagReviews: readonly TagReviewItem[];
    readonly deviceProfileReviews: readonly DeviceProfileReviewItem[];
  },
  resolution: VaultSyncResolution,
): Vault {
  return applyVaultSyncResolution(
    localVault,
    remoteVault,
    review,
    resolution,
    resolvingDeviceId,
  );
}

describe("applyVaultSyncResolution", () => {
  it("rejects local absence for a remote-only entry", () => {
    const remoteEntry = {
      id: "remote-entry",
      password: "password",
      login: "user@example.com",
      tags: [],
      sanitizedUrl: "https://example.com",
      versionVector: { "remote-device": 1 },
    } satisfies PasswordEntry;
    const localVault = createVault();
    const remoteVault = createVault({ entries: [remoteEntry] });

    expect(() =>
      applyResolution(
        localVault,
        remoteVault,
        {
          entryReviews: findChangedEntries(localVault, remoteVault),
          tagReviews: [],
          deviceProfileReviews: [],
        },
        {
          entryResolutions: [
            { entryId: remoteEntry.id, action: "use_local" },
          ],
          tagResolutions: [],
          deviceProfileResolutions: [],
        },
      ),
    ).toThrow(InvalidVaultSyncResolutionError);
  });

  it("applies a selected password without exposing it in the review", () => {
    const localEntry = {
      id: "changed-entry",
      password: "local-password",
      login: "user@example.com",
      tags: [],
      sanitizedUrl: "https://example.com",
      versionVector: { "remote-device": 1 },
    } satisfies PasswordEntry;
    const remoteEntry = {
      ...localEntry,
      password: "remote-password",
      versionVector: { "remote-device": 2 },
    } satisfies PasswordEntry;
    const localVault = createVault({ entries: [localEntry] });
    const remoteVault = createVault({ entries: [remoteEntry] });
    const entryReviews = findChangedEntries(localVault, remoteVault);

    expect(entryReviews[0]?.passwordChanged).toBe(true);
    expect(entryReviews[0]?.localEntry).not.toHaveProperty("entry.password");
    expect(entryReviews[0]?.remoteEntry).not.toHaveProperty("entry.password");

    const resolvedVault = applyResolution(
      localVault,
      remoteVault,
      { entryReviews, tagReviews: [], deviceProfileReviews: [] },
      {
        entryResolutions: [
          { entryId: remoteEntry.id, action: "use_remote" },
        ],
        tagResolutions: [],
        deviceProfileResolutions: [],
      },
    );

    expect(resolvedVault.entries[0]?.password).toBe("remote-password");
  });

  it("rejects local absence for a remote-only tag", () => {
    const remoteTag = {
      id: 1,
      name: "Remote",
      versionVector: { "remote-device": 1 },
    } satisfies Tag;
    const localVault = createVault();
    const remoteVault = createVault({ tags: [remoteTag] });

    expect(() =>
      applyResolution(
        localVault,
        remoteVault,
        {
          entryReviews: [],
          tagReviews: [
            {
              tagId: remoteTag.id,
              relation: "remote_only",
              preselectedAction: "use_remote",
              localTag: { state: "missing" },
              remoteTag: { state: "tag", tag: remoteTag },
            },
          ],
          deviceProfileReviews: [],
        },
        {
          entryResolutions: [],
          tagResolutions: [{ tagId: remoteTag.id, action: "use_local" }],
          deviceProfileResolutions: [],
        },
      ),
    ).toThrow(InvalidVaultSyncResolutionError);
  });

  it("rejects local absence for a remote-only device profile", () => {
    const remoteDeviceProfile = {
      id: "remote-device",
      name: "Remote device",
      createdAt: 1,
      versionVector: { "remote-device": 1 },
    } satisfies DeviceProfile;
    const localVault = createVault();
    const remoteVault = createVault({
      deviceProfiles: [remoteDeviceProfile],
    });

    expect(() =>
      applyResolution(
        localVault,
        remoteVault,
        {
          entryReviews: [],
          tagReviews: [],
          deviceProfileReviews: [
            {
              deviceId: remoteDeviceProfile.id,
              relation: "remote_only",
              preselectedAction: "use_remote",
              localDeviceProfile: { state: "missing" },
              remoteDeviceProfile: {
                state: "device_profile",
                deviceProfile: remoteDeviceProfile,
              },
            },
          ],
        },
        {
          entryResolutions: [],
          tagResolutions: [],
          deviceProfileResolutions: [
            { deviceId: remoteDeviceProfile.id, action: "use_local" },
          ],
        },
      ),
    ).toThrow(InvalidVaultSyncResolutionError);
  });
});
