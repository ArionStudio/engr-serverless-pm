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
  replacedDeviceId: string | null,
): Vault {
  if (hasDeviceProfileState(vault, deviceId)) {
    throw new DuplicateVaultDeviceProfileError(deviceId);
  }

  const replacedDeviceProfile =
    replacedDeviceId === null
      ? undefined
      : vault.deviceProfiles.find(
          (deviceProfile) => deviceProfile.id === replacedDeviceId,
        );
  const versionVector = incrementVersionVector(vault.versionVector, deviceId);
  const deviceProfile: DeviceProfile = {
    id: deviceId,
    name: deviceName,
    createdAt,
    versionVector: {
      [deviceId]: versionVector[deviceId],
    },
  };
  const deletedDeviceProfiles =
    replacedDeviceProfile === undefined
      ? vault.deletedDeviceProfiles
      : [
          ...vault.deletedDeviceProfiles.filter(
            (deviceProfile) => deviceProfile.id !== replacedDeviceProfile.id,
          ),
          {
            id: replacedDeviceProfile.id,
            versionVector: incrementVersionVector(
              replacedDeviceProfile.versionVector,
              deviceId,
            ),
            deletedAt: createdAt,
          },
        ];

  return {
    ...vault,
    versionVector,
    deviceProfiles: [
      ...removeReplacedDeviceProfile(
        vault.deviceProfiles,
        replacedDeviceProfile,
      ),
      deviceProfile,
    ],
    deletedDeviceProfiles,
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

function removeReplacedDeviceProfile(
  deviceProfiles: DeviceProfile[],
  replacedDeviceProfile: DeviceProfile | undefined,
): DeviceProfile[] {
  if (replacedDeviceProfile === undefined) {
    return deviceProfiles;
  }

  return deviceProfiles.filter(
    (deviceProfile) => deviceProfile.id !== replacedDeviceProfile.id,
  );
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
