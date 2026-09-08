import type { DeviceProfile } from "../device-profile/device-profile";
import type { VisiblePasswordEntryFields } from "../entry/password-entry.type";
import type { VisibleTagFields } from "../entry/tag.type";
import type { VisibleFolderFields } from "../organization/folder.type";
import type { VisibleTagGroupFields } from "../organization/tag-group.type";

export type VisibleVaultFields = {
  readonly entries: readonly VisiblePasswordEntryFields[];
  readonly deviceProfiles: readonly Pick<
    DeviceProfile,
    "id" | "name" | "createdAt"
  >[];
  readonly tags: readonly VisibleTagFields[];
  readonly tagGroups: readonly VisibleTagGroupFields[];
  readonly folders: readonly VisibleFolderFields[];
  readonly syncConfigured: boolean;
};
