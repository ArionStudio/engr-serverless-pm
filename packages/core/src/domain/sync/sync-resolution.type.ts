import type { DeviceProfileReviewResolution } from "./device-profile-resolution.type";
import type { EntryReviewResolution } from "./entry-resolution.type";
import type { TagReviewResolution } from "./tag-resolution.type";

export type { DeviceProfileReviewResolution } from "./device-profile-resolution.type";
export type { EntryReviewResolution } from "./entry-resolution.type";
export type { TagReviewResolution } from "./tag-resolution.type";

export type VaultSyncResolution = {
  readonly entryResolutions: readonly EntryReviewResolution[];
  readonly tagResolutions: readonly TagReviewResolution[];
  readonly deviceProfileResolutions: readonly DeviceProfileReviewResolution[];
};
