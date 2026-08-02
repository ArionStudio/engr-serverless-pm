import type { Vault } from "../vault/vault";
import {
  incrementVersionVector,
  mergeVersionVectors,
} from "../versioning/version-vector.utils";
import type { DeviceProfileReviewItem } from "./device-profile-review.type";
import {
  buildResolvedVaultDeviceProfiles,
  resolveDeviceProfileStates,
} from "./device-profile-resolution.utils";
import type { EntryReviewItem } from "./entry-review.type";
import {
  buildResolvedVaultEntries,
  resolveEntryStates,
} from "./entry-resolution.utils";
import type { VaultSyncResolution } from "./sync-resolution.type";
import type { TagReviewItem } from "./tag-review.type";
import {
  buildResolvedVaultTags,
  resolveTagStates,
} from "./tag-resolution.utils";

export function applyVaultSyncResolution(
  localVault: Vault,
  remoteVault: Vault,
  review: {
    readonly entryReviews: readonly EntryReviewItem[];
    readonly tagReviews: readonly TagReviewItem[];
    readonly deviceProfileReviews: readonly DeviceProfileReviewItem[];
  },
  resolution: VaultSyncResolution,
  deviceId: string,
): Vault {
  const resolvedEntryStateById = resolveEntryStates(
    review.entryReviews,
    resolution.entryResolutions,
    deviceId,
  );
  const resolvedTagStateById = resolveTagStates(
    review.tagReviews,
    resolution.tagResolutions,
    deviceId,
  );
  const resolvedDeviceProfileStateById = resolveDeviceProfileStates(
    review.deviceProfileReviews,
    resolution.deviceProfileResolutions,
    deviceId,
  );
  const versionVector = incrementVersionVector(
    mergeVersionVectors(localVault.versionVector, remoteVault.versionVector),
    deviceId,
  );

  return {
    ...localVault,
    versionVector,
    ...buildResolvedVaultEntries(
      localVault,
      remoteVault,
      resolvedEntryStateById,
    ),
    ...buildResolvedVaultTags(localVault, remoteVault, resolvedTagStateById),
    ...buildResolvedVaultDeviceProfiles(
      localVault,
      remoteVault,
      resolvedDeviceProfileStateById,
    ),
  };
}
