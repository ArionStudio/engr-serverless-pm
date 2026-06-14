import { InvalidVaultSyncResolutionError } from "../../errors/sync.errors";
import type {
  DeletedDeviceProfile,
  DeviceProfile,
} from "../device-profile/device-profile";
import type { Vault } from "../vault/vault";
import type { VersionVector } from "../versioning/version-vector.type";
import {
  incrementVersionVector,
  mergeVersionVectors,
} from "../versioning/version-vector.utils";
import type {
  DeviceProfileReviewItem,
  ReviewableDeviceProfile,
} from "./device-profile-review.type";
import type { DeviceProfileReviewResolution } from "./device-profile-resolution.type";
import type { VaultSyncReviewAction } from "./vault-sync-item-review.type";

export function resolveDeviceProfileStates(
  deviceProfileReviews: readonly DeviceProfileReviewItem[],
  deviceProfileResolutions: readonly DeviceProfileReviewResolution[],
  deviceId: string,
): Map<string, ReviewableDeviceProfile> {
  const resolutionById = createDeviceProfileResolutionMap(
    deviceProfileResolutions,
  );
  const resolvedStateById = new Map<string, ReviewableDeviceProfile>();

  for (const deviceProfileResolution of deviceProfileResolutions) {
    if (
      !deviceProfileReviews.some(
        (deviceProfileReview) =>
          deviceProfileReview.deviceId === deviceProfileResolution.deviceId,
      )
    ) {
      throw new InvalidVaultSyncResolutionError(
        `Device profile "${deviceProfileResolution.deviceId}" does not require sync resolution.`,
      );
    }
  }

  for (const deviceProfileReview of deviceProfileReviews) {
    const deviceProfileResolution = resolutionById.get(
      deviceProfileReview.deviceId,
    );

    if (deviceProfileResolution === undefined) {
      throw new InvalidVaultSyncResolutionError(
        `Device profile "${deviceProfileReview.deviceId}" must have a sync resolution.`,
      );
    }

    resolvedStateById.set(
      deviceProfileReview.deviceId,
      stampDeviceProfileState(
        selectDeviceProfileState(deviceProfileReview, deviceProfileResolution),
        deviceProfileReview.localDeviceProfile,
        deviceProfileReview.remoteDeviceProfile,
        deviceId,
      ),
    );
  }

  return resolvedStateById;
}

export function buildResolvedVaultDeviceProfiles(
  localVault: Vault,
  remoteVault: Vault,
  resolvedStateById: ReadonlyMap<string, ReviewableDeviceProfile>,
): {
  readonly deviceProfiles: DeviceProfile[];
  readonly deletedDeviceProfiles: DeletedDeviceProfile[];
} {
  const deviceProfiles: DeviceProfile[] = [];
  const deletedDeviceProfiles: DeletedDeviceProfile[] = [];

  for (const deviceId of collectDeviceProfileIds(localVault, remoteVault)) {
    const state =
      resolvedStateById.get(deviceId) ??
      getDeviceProfileState(localVault, deviceId);

    if (state.state === "device_profile") {
      deviceProfiles.push(state.deviceProfile);
    }

    if (state.state === "deleted") {
      deletedDeviceProfiles.push(state.deletedDeviceProfile);
    }
  }

  return {
    deviceProfiles,
    deletedDeviceProfiles,
  };
}

function createDeviceProfileResolutionMap(
  deviceProfileResolutions: readonly DeviceProfileReviewResolution[],
): Map<string, DeviceProfileReviewResolution> {
  const resolutionById = new Map<string, DeviceProfileReviewResolution>();

  for (const deviceProfileResolution of deviceProfileResolutions) {
    assertSupportedAction(deviceProfileResolution.action);

    if (resolutionById.has(deviceProfileResolution.deviceId)) {
      throw new InvalidVaultSyncResolutionError(
        `Device profile "${deviceProfileResolution.deviceId}" has multiple sync resolutions.`,
      );
    }

    resolutionById.set(
      deviceProfileResolution.deviceId,
      deviceProfileResolution,
    );
  }

  return resolutionById;
}

function selectDeviceProfileState(
  deviceProfileReview: DeviceProfileReviewItem,
  deviceProfileResolution: DeviceProfileReviewResolution,
): ReviewableDeviceProfile {
  return deviceProfileResolution.action === "use_local"
    ? deviceProfileReview.localDeviceProfile
    : deviceProfileReview.remoteDeviceProfile;
}

function stampDeviceProfileState(
  selectedState: ReviewableDeviceProfile,
  localState: ReviewableDeviceProfile,
  remoteState: ReviewableDeviceProfile,
  deviceId: string,
): ReviewableDeviceProfile {
  if (selectedState.state === "missing") {
    return selectedState;
  }

  const versionVector = stampResolvedVersionVector(
    getDeviceProfileVersionVector(localState),
    getDeviceProfileVersionVector(remoteState),
    deviceId,
  );

  if (selectedState.state === "device_profile") {
    return {
      state: "device_profile",
      deviceProfile: {
        ...selectedState.deviceProfile,
        versionVector,
      },
    };
  }

  return {
    state: "deleted",
    deletedDeviceProfile: {
      ...selectedState.deletedDeviceProfile,
      versionVector,
    },
  };
}

function getDeviceProfileVersionVector(
  state: ReviewableDeviceProfile,
): VersionVector | null {
  if (state.state === "missing") {
    return null;
  }

  if (state.state === "device_profile") {
    return state.deviceProfile.versionVector;
  }

  return state.deletedDeviceProfile.versionVector;
}

function collectDeviceProfileIds(
  localVault: Vault,
  remoteVault: Vault,
): Set<string> {
  return new Set([
    ...localVault.deviceProfiles.map((deviceProfile) => deviceProfile.id),
    ...remoteVault.deviceProfiles.map((deviceProfile) => deviceProfile.id),
    ...localVault.deletedDeviceProfiles.map(
      (deletedDeviceProfile) => deletedDeviceProfile.id,
    ),
    ...remoteVault.deletedDeviceProfiles.map(
      (deletedDeviceProfile) => deletedDeviceProfile.id,
    ),
  ]);
}

function getDeviceProfileState(
  vault: Vault,
  deviceId: string,
): ReviewableDeviceProfile {
  const deviceProfile = vault.deviceProfiles.find(
    (vaultDeviceProfile) => vaultDeviceProfile.id === deviceId,
  );
  const deletedDeviceProfile = vault.deletedDeviceProfiles.find(
    (vaultDeletedDeviceProfile) => vaultDeletedDeviceProfile.id === deviceId,
  );

  if (deviceProfile !== undefined && deletedDeviceProfile !== undefined) {
    throw new InvalidVaultSyncResolutionError(
      `Device profile "${deviceId}" exists as both active and deleted in the same vault.`,
    );
  }

  if (deviceProfile !== undefined) {
    return {
      state: "device_profile",
      deviceProfile,
    };
  }

  if (deletedDeviceProfile !== undefined) {
    return {
      state: "deleted",
      deletedDeviceProfile,
    };
  }

  return {
    state: "missing",
  };
}

function assertSupportedAction(action: VaultSyncReviewAction): void {
  if (action === "use_local" || action === "use_remote") {
    return;
  }

  throw new InvalidVaultSyncResolutionError(
    "Unsupported sync resolution action.",
  );
}

function stampResolvedVersionVector(
  localVersionVector: VersionVector | null,
  remoteVersionVector: VersionVector | null,
  deviceId: string,
): VersionVector {
  return incrementVersionVector(
    mergeVersionVectors(localVersionVector ?? {}, remoteVersionVector ?? {}),
    deviceId,
  );
}
