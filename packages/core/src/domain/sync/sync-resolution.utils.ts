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
import { requireValidVaultTagReferences } from "../vault/vault-tag-reference.policy";
import type { FolderReviewItem } from "./folder-review.type";
import {
  buildResolvedVaultFolders,
  resolveFolderStates,
} from "./folder-resolution.utils";
import { requireValidVaultOrganization } from "../vault/vault-organization-reference.policy";
import {
  InvalidVaultSyncResolutionError,
  InvalidVaultSyncReviewError,
} from "../../errors";
import { areJsonEqual } from "../common";
import { InvalidVaultTagReferenceError } from "../../errors/vault-tag.errors";
import { InvalidVaultOrganizationReferenceError } from "../../errors/vault-organization.errors";

export function cloneVaultSyncResolution(
  resolution: VaultSyncResolution,
): VaultSyncResolution {
  return {
    entryResolutions: resolution.entryResolutions.map((item) => ({ ...item })),
    tagResolutions: resolution.tagResolutions.map((item) => ({ ...item })),
    folderResolutions: resolution.folderResolutions.map((item) => ({
      ...item,
    })),
    deviceProfileResolutions: resolution.deviceProfileResolutions.map(
      (item) => ({ ...item }),
    ),
  };
}

export function applyVaultSyncResolution(
  localVault: Vault,
  remoteVault: Vault,
  review: {
    readonly entryReviews: readonly EntryReviewItem[];
    readonly tagReviews: readonly TagReviewItem[];
    readonly folderReviews: readonly FolderReviewItem[];
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
  const resolvedFolderStateById = resolveFolderStates(
    review.folderReviews,
    resolution.folderResolutions,
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

  const resolvedVault: Vault = {
    ...localVault,
    versionVector,
    ...buildResolvedVaultEntries(
      localVault,
      remoteVault,
      resolvedEntryStateById,
    ),
    ...buildResolvedVaultTags(localVault, remoteVault, resolvedTagStateById),
    ...buildResolvedVaultFolders(
      localVault,
      remoteVault,
      resolvedFolderStateById,
    ),
    ...buildResolvedVaultDeviceProfiles(
      localVault,
      remoteVault,
      resolvedDeviceProfileStateById,
    ),
  };
  if (!areJsonEqual(localVault.tagGroups, remoteVault.tagGroups)) {
    throw new InvalidVaultSyncReviewError(
      "Local and remote tag-group definitions do not match.",
    );
  }
  try {
    requireValidVaultTagReferences(resolvedVault);
    requireValidVaultOrganization(resolvedVault);
  } catch (error) {
    if (
      error instanceof InvalidVaultTagReferenceError ||
      error instanceof InvalidVaultOrganizationReferenceError
    ) {
      throw new InvalidVaultSyncResolutionError(
        "The selected sync resolution contains incompatible vault organization references.",
      );
    }
    throw error;
  }
  return resolvedVault;
}
