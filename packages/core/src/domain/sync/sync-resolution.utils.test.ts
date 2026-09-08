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
import type { FolderReviewItem } from "./folder-review.type";
import { createDefaultTagGroups } from "../organization/tag-group.defaults";
import type { Folder } from "../organization/folder.type";
import { findChangedFolders } from "./folder-review.utils";

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
    tagGroups: createDefaultTagGroups(),
    folders: [],
    deletedFolders: [],
    ...overrides,
  };
}

function applyResolution(
  localVault: Vault,
  remoteVault: Vault,
  review: {
    readonly entryReviews: readonly EntryReviewItem[];
    readonly folderReviews: readonly FolderReviewItem[];
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
      folderId: "uncategorized",
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
          folderReviews: [],
          tagReviews: [],
          deviceProfileReviews: [],
        },
        {
          entryResolutions: [{ entryId: remoteEntry.id, action: "use_local" }],
          folderResolutions: [],
          tagResolutions: [],
          deviceProfileResolutions: [],
        },
      ),
    ).toThrow(InvalidVaultSyncResolutionError);
  });

  it("applies the selected password from the authoritative entry review", () => {
    const localEntry = {
      id: "changed-entry",
      password: "local-password",
      login: "user@example.com",
      tags: [],
      sanitizedUrl: "https://example.com",
      folderId: "uncategorized",
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

    const resolvedVault = applyResolution(
      localVault,
      remoteVault,
      {
        entryReviews,
        tagReviews: [],
        folderReviews: [],
        deviceProfileReviews: [],
      },
      {
        entryResolutions: [{ entryId: remoteEntry.id, action: "use_remote" }],
        folderResolutions: [],
        tagResolutions: [],
        deviceProfileResolutions: [],
      },
    );

    expect(resolvedVault.entries[0]?.password).toBe("remote-password");
  });

  it("rejects local absence for a remote-only tag", () => {
    const remoteTag = {
      id: "remote-tag",
      name: "Remote",
      groupId: "other",
      color: "gray",
      shade: 500,
      createdAt: 1,
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
          folderReviews: [],
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
          folderResolutions: [],
          tagResolutions: [{ tagId: remoteTag.id, action: "use_local" }],
          deviceProfileResolutions: [],
        },
      ),
    ).toThrow(InvalidVaultSyncResolutionError);
  });

  it("rejects a resolution that would leave an entry referencing a deleted tag", () => {
    const tag = {
      id: "work-tag",
      name: "Work",
      groupId: "topic",
      color: "blue",
      shade: 500,
      createdAt: 1,
      versionVector: { "remote-device": 1 },
    } satisfies Tag;
    const entry = {
      id: "entry-id",
      password: "password",
      login: "user@example.com",
      tags: [tag.id],
      sanitizedUrl: "https://example.com",
      folderId: "uncategorized",
      versionVector: { "remote-device": 1 },
    } satisfies PasswordEntry;
    const deletedTag = {
      id: tag.id,
      versionVector: { "remote-device": 2 },
      deletedAt: 2,
    };
    const localVault = createVault({ entries: [entry], tags: [tag] });
    const remoteVault = createVault({
      entries: [entry],
      deletedTags: [deletedTag],
    });

    expect(() =>
      applyResolution(
        localVault,
        remoteVault,
        {
          entryReviews: [],
          folderReviews: [],
          tagReviews: [
            {
              tagId: tag.id,
              relation: "remote_ahead",
              preselectedAction: "use_remote",
              localTag: { state: "tag", tag },
              remoteTag: { state: "deleted", deletedTag },
            },
          ],
          deviceProfileReviews: [],
        },
        {
          entryResolutions: [],
          folderResolutions: [],
          tagResolutions: [{ tagId: tag.id, action: "use_remote" }],
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
          folderReviews: [],
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
          folderResolutions: [],
          tagResolutions: [],
          deviceProfileResolutions: [
            { deviceId: remoteDeviceProfile.id, action: "use_local" },
          ],
        },
      ),
    ).toThrow(InvalidVaultSyncResolutionError);
  });

  it("adopts a remote-only folder through an explicit folder resolution", () => {
    const remoteFolder = {
      id: "work",
      name: "Work",
      icon: "briefcase",
      parentId: null,
      createdAt: 1,
      versionVector: { "remote-device": 1 },
    } satisfies Folder;
    const localVault = createVault();
    const remoteVault = createVault({ folders: [remoteFolder] });

    const resolved = applyResolution(
      localVault,
      remoteVault,
      {
        entryReviews: [],
        tagReviews: [],
        folderReviews: findChangedFolders(localVault, remoteVault),
        deviceProfileReviews: [],
      },
      {
        entryResolutions: [],
        tagResolutions: [],
        folderResolutions: [{ folderId: "work", action: "use_remote" }],
        deviceProfileResolutions: [],
      },
    );

    expect(resolved.folders).toEqual([
      {
        ...remoteFolder,
        versionVector: {
          "remote-device": 1,
          [resolvingDeviceId]: 1,
        },
      },
    ]);
  });
});
