import { areJsonEqual } from "../common/json.utils";
import type { VaultSnapshot } from "../snapshot/vault-snapshot";
import type { Vault } from "../vault/vault";
import {
  incrementVersionVector,
  mergeVersionVectors,
} from "../versioning/version-vector.utils";
import {
  buildResolvedVaultDeviceProfiles,
  createDeviceProfileReviews,
  resolveDeviceProfileStates,
} from "./vault-sync-device-profile-review.utils";
import {
  buildResolvedVaultEntries,
  createEntryReviews,
  resolveEntryStates,
} from "./vault-sync-entry-review.utils";
import {
  buildResolvedVaultTags,
  createTagReviews,
  resolveTagStates,
} from "./vault-sync-tag-review.utils";
import type {
  VaultSyncResolution,
  VaultSyncReview,
  VaultSyncTrustState,
} from "./vault-sync-review.type";

export function createVaultSyncTrustState(snapshot: VaultSnapshot) {
  return {
    trustedDevices: snapshot.trustedDevices,
    keySlots: snapshot.keySlots,
  };
}

export function createVaultSyncReview(
  localVault: Vault,
  remoteVault: Vault,
  localTrustState?: VaultSyncTrustState,
  remoteTrustState?: VaultSyncTrustState,
): VaultSyncReview {
  const entryReviews = createEntryReviews(localVault, remoteVault);
  const tagReviews = createTagReviews(localVault, remoteVault);
  const deviceProfileReviews = createDeviceProfileReviews(
    localVault,
    remoteVault,
  );
  const trustReview =
    localTrustState !== undefined &&
    remoteTrustState !== undefined &&
    !areJsonEqual(
      normalizeTrustState(localTrustState),
      normalizeTrustState(remoteTrustState),
    )
      ? {
          kind: "device_trust" as const,
          localTrustState,
          remoteTrustState,
          informational: true as const,
        }
      : undefined;

  return {
    entryReviews,
    tagReviews,
    deviceProfileReviews,
    ...(trustReview !== undefined ? { trustReview } : {}),
    hasChanges:
      entryReviews.length > 0 ||
      tagReviews.length > 0 ||
      deviceProfileReviews.length > 0,
    hasConflicts:
      entryReviews.some((review) => review.conflict) ||
      tagReviews.some((review) => review.conflict) ||
      deviceProfileReviews.some((review) => review.conflict),
  };
}

export function createPreselectedVaultSyncResolution(
  review: VaultSyncReview,
): VaultSyncResolution {
  return {
    entryResolutions: review.entryReviews.map((entryReview) => ({
      kind: "password_entry" as const,
      entryId: entryReview.entryId,
      action: entryReview.preselectedAction,
    })),
    tagResolutions: review.tagReviews.map((tagReview) => ({
      kind: "tag" as const,
      tagId: tagReview.tagId,
      action: tagReview.preselectedAction,
    })),
    deviceProfileResolutions: review.deviceProfileReviews.map(
      (deviceProfileReview) => ({
        kind: "device_profile" as const,
        deviceId: deviceProfileReview.deviceId,
        action: deviceProfileReview.preselectedAction,
      }),
    ),
  };
}

export function applyVaultSyncResolution(
  localVault: Vault,
  remoteVault: Vault,
  resolution: VaultSyncResolution,
  deviceId: string,
): Vault {
  const review = createVaultSyncReview(localVault, remoteVault);
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
  const resolvedEntries = buildResolvedVaultEntries(
    localVault,
    remoteVault,
    resolvedEntryStateById,
  );
  const resolvedTags = buildResolvedVaultTags(
    localVault,
    remoteVault,
    resolvedTagStateById,
  );
  const resolvedDeviceProfiles = buildResolvedVaultDeviceProfiles(
    localVault,
    remoteVault,
    resolvedDeviceProfileStateById,
  );
  const versionVector = incrementVersionVector(
    mergeVersionVectors(localVault.versionVector, remoteVault.versionVector),
    deviceId,
  );

  return {
    ...localVault,
    versionVector,
    ...resolvedEntries,
    ...resolvedTags,
    ...resolvedDeviceProfiles,
  };
}

function normalizeTrustState(trustState: VaultSyncTrustState) {
  return {
    trustedDevices: [...trustState.trustedDevices].sort(
      (currentTrustedDevice, nextTrustedDevice) =>
        currentTrustedDevice.id.localeCompare(nextTrustedDevice.id),
    ),
    keySlots: {
      deviceSlots: [...trustState.keySlots.deviceSlots].sort(
        (currentDeviceSlot, nextDeviceSlot) =>
          currentDeviceSlot.deviceId.localeCompare(nextDeviceSlot.deviceId),
      ),
      recoveryKeySlot: trustState.keySlots.recoveryKeySlot,
      ...(trustState.keySlots.enrollmentKeySlot !== undefined
        ? { enrollmentKeySlot: trustState.keySlots.enrollmentKeySlot }
        : {}),
    },
  };
}
