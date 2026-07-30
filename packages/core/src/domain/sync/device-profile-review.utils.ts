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
  const deviceProfiles = vault.deviceProfiles.filter(
    (deviceProfile) => deviceProfile.id === deviceId,
  );
  const deletedDeviceProfiles = vault.deletedDeviceProfiles.filter(
    (deletedDeviceProfile) => deletedDeviceProfile.id === deviceId,
  );

  if (deviceProfiles.length > 1 || deletedDeviceProfiles.length > 1) {
    throw new InvalidVaultSyncReviewError(
      `Device profile "${deviceId}" occurs more than once in the same vault.`,
    );
  }

  const deviceProfile = deviceProfiles[0];
  const deletedDeviceProfile = deletedDeviceProfiles[0];

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

export function requireDeviceProfilesMatchTrust(
  vault: Vault,
  trustedDeviceIds: ReadonlySet<string>,
  historicalDeviceIds: ReadonlySet<string>,
): void {
  const deviceIds = new Set([
    ...vault.deviceProfiles.map((profile) => profile.id),
    ...vault.deletedDeviceProfiles.map((profile) => profile.id),
  ]);

  for (const deviceId of deviceIds) {
    const profile = findDeviceProfile(vault, deviceId);

    if (
      (profile.state === "device_profile" && !trustedDeviceIds.has(deviceId)) ||
      (profile.state === "deleted" &&
        (trustedDeviceIds.has(deviceId) || !historicalDeviceIds.has(deviceId)))
    ) {
      throw new InvalidVaultSyncReviewError(
        `Device profile "${deviceId}" does not match the vault trust state.`,
      );
    }
  }
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
