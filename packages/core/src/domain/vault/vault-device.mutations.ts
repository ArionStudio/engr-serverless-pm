import type { DeviceProfile } from "../device-profile/device-profile";
import { DuplicateVaultDeviceProfileError } from "../../errors/vault-device.errors";
import { incrementVersionVector } from "../versioning/version-vector.utils";
import type { Vault } from "./vault";

export function addDeviceProfileToVault(
  vault: Vault,
  deviceId: string,
  deviceName: string,
  createdAt: number,
): Vault {
  if (hasDeviceProfileState(vault, deviceId)) {
    throw new DuplicateVaultDeviceProfileError(deviceId);
  }

  const versionVector = incrementVersionVector(vault.versionVector, deviceId);
  const deviceProfile: DeviceProfile = {
    id: deviceId,
    name: deviceName,
    createdAt,
    versionVector: {
      [deviceId]: versionVector[deviceId],
    },
  };

  return {
    ...vault,
    versionVector,
    deviceProfiles: [...vault.deviceProfiles, deviceProfile],
  };
}

export function addRecoveredDeviceProfileToVault(
  vault: Vault,
  deviceId: string,
  deviceName: string,
  createdAt: number,
): Vault {
  if (hasDeviceProfileState(vault, deviceId)) {
    throw new DuplicateVaultDeviceProfileError(deviceId);
  }

  const versionVector = incrementVersionVector(vault.versionVector, deviceId);
  const deviceProfile: DeviceProfile = {
    id: deviceId,
    name: deviceName,
    createdAt,
    versionVector: {
      [deviceId]: versionVector[deviceId],
    },
  };

  return {
    ...vault,
    versionVector,
    deviceProfiles: [...vault.deviceProfiles, deviceProfile],
  };
}

export function resetDeviceProfilesToRecoveredDevice(
  vault: Vault,
  deviceId: string,
  deviceName: string,
  createdAt: number,
): Vault {
  if (hasDeviceProfileState(vault, deviceId)) {
    throw new DuplicateVaultDeviceProfileError(deviceId);
  }

  const versionVector = incrementVersionVector(vault.versionVector, deviceId);
  const deviceProfile: DeviceProfile = {
    id: deviceId,
    name: deviceName,
    createdAt,
    versionVector: {
      [deviceId]: versionVector[deviceId],
    },
  };
  const removedDeviceIds = new Set(
    vault.deviceProfiles.map((removedDeviceProfile) => removedDeviceProfile.id),
  );

  return {
    ...vault,
    versionVector,
    deviceProfiles: [deviceProfile],
    deletedDeviceProfiles: [
      ...vault.deletedDeviceProfiles.filter(
        (deletedDeviceProfile) =>
          !removedDeviceIds.has(deletedDeviceProfile.id),
      ),
      ...vault.deviceProfiles.map((removedDeviceProfile) => ({
        id: removedDeviceProfile.id,
        versionVector: incrementVersionVector(
          removedDeviceProfile.versionVector,
          deviceId,
        ),
        deletedAt: createdAt,
      })),
    ],
  };
}

export function removeOtherDeviceProfilesFromVault(
  vault: Vault,
  currentDeviceId: string,
  deletedAt: number,
): Vault {
  const currentDeviceProfile = vault.deviceProfiles.find(
    (deviceProfile) => deviceProfile.id === currentDeviceId,
  );

  if (currentDeviceProfile === undefined) {
    return vault;
  }

  const removedDeviceProfiles = vault.deviceProfiles.filter(
    (deviceProfile) => deviceProfile.id !== currentDeviceId,
  );

  if (removedDeviceProfiles.length === 0) {
    return vault;
  }

  const versionVector = incrementVersionVector(
    vault.versionVector,
    currentDeviceId,
  );
  const removedDeviceIds = new Set(
    removedDeviceProfiles.map(
      (removedDeviceProfile) => removedDeviceProfile.id,
    ),
  );

  return {
    ...vault,
    versionVector,
    deviceProfiles: [currentDeviceProfile],
    deletedDeviceProfiles: [
      ...vault.deletedDeviceProfiles.filter(
        (deletedDeviceProfile) =>
          !removedDeviceIds.has(deletedDeviceProfile.id),
      ),
      ...removedDeviceProfiles.map((removedDeviceProfile) => ({
        id: removedDeviceProfile.id,
        versionVector: incrementVersionVector(
          removedDeviceProfile.versionVector,
          currentDeviceId,
        ),
        deletedAt,
      })),
    ],
  };
}

export function revokeDeviceProfileFromVault(
  vault: Vault,
  revokingDeviceId: string,
  revokedDeviceId: string,
  deletedAt: number,
): Vault {
  const revokedDeviceProfile = vault.deviceProfiles.find(
    (deviceProfile) => deviceProfile.id === revokedDeviceId,
  );

  if (revokedDeviceProfile === undefined) {
    return vault;
  }

  const versionVector = incrementVersionVector(
    vault.versionVector,
    revokingDeviceId,
  );

  return {
    ...vault,
    versionVector,
    deviceProfiles: vault.deviceProfiles.filter(
      (deviceProfile) => deviceProfile.id !== revokedDeviceId,
    ),
    deletedDeviceProfiles: [
      ...vault.deletedDeviceProfiles.filter(
        (deviceProfile) => deviceProfile.id !== revokedDeviceId,
      ),
      {
        id: revokedDeviceId,
        versionVector: incrementVersionVector(
          revokedDeviceProfile.versionVector,
          revokingDeviceId,
        ),
        deletedAt,
      },
    ],
  };
}

function hasDeviceProfileState(vault: Vault, deviceId: string): boolean {
  return (
    vault.deviceProfiles.some(
      (deviceProfile) => deviceProfile.id === deviceId,
    ) ||
    vault.deletedDeviceProfiles.some(
      (deviceProfile) => deviceProfile.id === deviceId,
    )
  );
}
