import type { DeviceProfile } from "../device/device";
import { incrementVersionVector } from "../sync/version-vector.utils";
import type { Vault } from "./vault";
import { DuplicateVaultDeviceProfileError } from "./vault-device.errors";

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
