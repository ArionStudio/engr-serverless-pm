import type { DeviceProfile } from "../device-profile/device-profile";
import type { VisiblePasswordEntryFields } from "../entry/password-entry.type";
import type { Tag } from "../entry/tag.type";

export type VisibleVaultFields = {
  readonly entries: readonly VisiblePasswordEntryFields[];
  readonly deviceProfiles: readonly Pick<
    DeviceProfile,
    "id" | "name" | "createdAt"
  >[];
  readonly tags: readonly Pick<Tag, "id" | "name">[];
  readonly syncConfigured: boolean;
};
