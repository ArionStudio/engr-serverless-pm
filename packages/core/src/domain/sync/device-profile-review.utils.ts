import { InvalidVaultSyncReviewError } from "../../errors";
import { areJsonEqual } from "../common";
import type { Vault } from "../vault";
import type {
  DeviceProfileReviewItem,
  ReviewableDeviceProfile,
} from "./device-profile-review.type";
import type { VaultSyncItemRelation } from "./vault-sync-item-review.type";

export function findChangedDeviceProfiles(
  localVault: Vault,
  remoteVault: Vault,
): DeviceProfileReviewItem[] {
  const deviceProfileReviews: DeviceProfileReviewItem[] = [];

  for (const deviceId of findAllDeviceProfilesIds(localVault, remoteVault)) {
    const localDeviceProfile = findDeviceProfile(localVault, deviceId);
    const remoteDeviceProfile = findDeviceProfile(remoteVault, deviceId);
    const relation = getDeviceProfileRelation(
      localDeviceProfile,
      remoteDeviceProfile,
    );

    if (relation === "broken") {
      throw new InvalidVaultSyncReviewError(
        `Device profile "${deviceId}" has an invalid local/remote sync relation.`,
      );
    }

    if (relation === "equal") {
      continue;
    }

    deviceProfileReviews.push({
      deviceId,
      relation,
      preselectedAction: "use_remote",
      localDeviceProfile,
      remoteDeviceProfile,
    });
  }

  return deviceProfileReviews;
}

function findDeviceProfile(
  vault: Vault,
  deviceId: string,
): ReviewableDeviceProfile {
  const deviceProfile = vault.deviceProfiles.find(
    (deviceProfile) => deviceProfile.id === deviceId,
  );
  const deletedDeviceProfile = vault.deletedDeviceProfiles.find(
    (deletedDeviceProfile) => deletedDeviceProfile.id === deviceId,
  );

  if (deviceProfile !== undefined && deletedDeviceProfile !== undefined) {
    throw new InvalidVaultSyncReviewError(
      `Device profile "${deviceId}" exists as both active and deleted in the same vault.`,
    );
  }

  if (deviceProfile !== undefined) {
    return {
      deviceProfile,
      state: "device_profile",
    };
  }

  if (deletedDeviceProfile !== undefined) {
    return {
      deletedDeviceProfile,
      state: "deleted",
    };
  }

  return {
    state: "missing",
  };
}

function getDeviceProfileRelation(
  localDeviceProfile: ReviewableDeviceProfile,
  remoteDeviceProfile: ReviewableDeviceProfile,
): VaultSyncItemRelation {
  if (areJsonEqual(localDeviceProfile, remoteDeviceProfile)) {
    return "equal";
  }

  if (
    localDeviceProfile.state === "missing" &&
    remoteDeviceProfile.state === "missing"
  ) {
    return "broken";
  }

  if (localDeviceProfile.state === "missing") {
    return "remote_only";
  }

  if (remoteDeviceProfile.state === "missing") {
    return "broken";
  }

  const localVersionVector =
    localDeviceProfile.state === "device_profile"
      ? localDeviceProfile.deviceProfile.versionVector
      : localDeviceProfile.deletedDeviceProfile.versionVector;
  const remoteVersionVector =
    remoteDeviceProfile.state === "device_profile"
      ? remoteDeviceProfile.deviceProfile.versionVector
      : remoteDeviceProfile.deletedDeviceProfile.versionVector;

  let remoteHasNewerComponent = false;
  const deviceIds = new Set([
    ...Object.keys(localVersionVector),
    ...Object.keys(remoteVersionVector),
  ]);

  for (const deviceId of deviceIds) {
    const localValue = localVersionVector[deviceId] ?? 0;
    const remoteValue = remoteVersionVector[deviceId] ?? 0;

    if (localValue > remoteValue) {
      return "broken";
    }

    if (remoteValue > localValue) {
      remoteHasNewerComponent = true;
    }
  }

  if (remoteHasNewerComponent) {
    return "remote_ahead";
  }

  return "broken";
}

export function findAllDeviceProfilesIds(
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
