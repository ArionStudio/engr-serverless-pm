import { areJsonEqual } from "../common/json.utils";
import type { DeletedDeviceProfile, DeviceProfile } from "../device/device";
import type { Vault } from "../vault/vault";
import type { VersionVector } from "./version-vector.type";
import type {
  VaultSyncDeviceProfileResolution,
  VaultSyncDeviceProfileReview,
  VaultSyncDeviceProfileState,
} from "./vault-sync-device-profile-review.type";
import {
  getPreselectedSyncAction,
  getSyncItemRelation,
  hasSyncItemConflict,
  stampResolvedVersionVector,
} from "./vault-sync-item-review.utils";

export function createDeviceProfileReviews(
  localVault: Vault,
  remoteVault: Vault,
): VaultSyncDeviceProfileReview[] {
  const deviceProfileReviews: VaultSyncDeviceProfileReview[] = [];

  for (const deviceId of collectDeviceProfileIds(localVault, remoteVault)) {
    const localState = getDeviceProfileState(localVault, deviceId);
    const remoteState = getDeviceProfileState(remoteVault, deviceId);

    if (areJsonEqual(localState, remoteState)) {
      continue;
    }

    deviceProfileReviews.push(
      createDeviceProfileReview(deviceId, localState, remoteState),
    );
  }

  return deviceProfileReviews;
}

export function resolveDeviceProfileStates(
  deviceProfileReviews: readonly VaultSyncDeviceProfileReview[],
  deviceProfileResolutions: readonly VaultSyncDeviceProfileResolution[],
  deviceId: string,
): Map<string, VaultSyncDeviceProfileState> {
  const resolutionById = new Map<string, VaultSyncDeviceProfileResolution>();

  for (const deviceProfileResolution of deviceProfileResolutions) {
    if (resolutionById.has(deviceProfileResolution.deviceId)) {
      throw new Error(
        `Device profile "${deviceProfileResolution.deviceId}" has multiple sync resolutions.`,
      );
    }

    resolutionById.set(
      deviceProfileResolution.deviceId,
      deviceProfileResolution,
    );
  }

  for (const deviceProfileResolution of deviceProfileResolutions) {
    if (
      !deviceProfileReviews.some(
        (deviceProfileReview) =>
          deviceProfileReview.deviceId === deviceProfileResolution.deviceId,
      )
    ) {
      throw new Error(
        `Device profile "${deviceProfileResolution.deviceId}" does not require sync resolution.`,
      );
    }
  }

  const resolvedStateById = new Map<string, VaultSyncDeviceProfileState>();

  for (const deviceProfileReview of deviceProfileReviews) {
    const deviceProfileResolution = resolutionById.get(
      deviceProfileReview.deviceId,
    );

    if (deviceProfileResolution === undefined) {
      throw new Error(
        `Device profile "${deviceProfileReview.deviceId}" must have a sync resolution.`,
      );
    }

    resolvedStateById.set(
      deviceProfileReview.deviceId,
      stampDeviceProfileState(
        selectDeviceProfileState(deviceProfileReview, deviceProfileResolution),
        deviceProfileReview.localState,
        deviceProfileReview.remoteState,
        deviceId,
      ),
    );
  }

  return resolvedStateById;
}

export function buildResolvedVaultDeviceProfiles(
  localVault: Vault,
  remoteVault: Vault,
  resolvedStateById: ReadonlyMap<string, VaultSyncDeviceProfileState>,
): {
  readonly deviceProfiles: DeviceProfile[];
  readonly deletedDeviceProfiles: DeletedDeviceProfile[];
} {
  const deviceProfiles: DeviceProfile[] = [];
  const deletedDeviceProfiles: DeletedDeviceProfile[] = [];

  for (const profileId of collectDeviceProfileIds(localVault, remoteVault)) {
    const state =
      resolvedStateById.get(profileId) ??
      getDeviceProfileState(localVault, profileId);

    if (state.kind === "device_profile") {
      deviceProfiles.push(state.deviceProfile);
    }

    if (state.kind === "deleted") {
      deletedDeviceProfiles.push(state.deletedDeviceProfile);
    }
  }

  return {
    deviceProfiles,
    deletedDeviceProfiles,
  };
}

function createDeviceProfileReview(
  deviceId: string,
  localState: VaultSyncDeviceProfileState,
  remoteState: VaultSyncDeviceProfileState,
): VaultSyncDeviceProfileReview {
  const relation = getSyncItemRelation(
    getOptionalDeviceProfileStateVersionVector(localState),
    getOptionalDeviceProfileStateVersionVector(remoteState),
  );

  return {
    kind: "device_profile",
    deviceId,
    relation,
    conflict: hasSyncItemConflict(relation, localState, remoteState),
    preselectedAction: getPreselectedSyncAction(relation),
    localState,
    remoteState,
  };
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
): VaultSyncDeviceProfileState {
  const deviceProfile = vault.deviceProfiles.find(
    (vaultDeviceProfile) => vaultDeviceProfile.id === deviceId,
  );

  if (deviceProfile !== undefined) {
    return {
      kind: "device_profile",
      deviceProfile,
    };
  }

  const deletedDeviceProfile = vault.deletedDeviceProfiles.find(
    (vaultDeletedDeviceProfile) => vaultDeletedDeviceProfile.id === deviceId,
  );

  if (deletedDeviceProfile !== undefined) {
    return {
      kind: "deleted",
      deletedDeviceProfile,
    };
  }

  return {
    kind: "missing",
  };
}

function selectDeviceProfileState(
  deviceProfileReview: VaultSyncDeviceProfileReview,
  deviceProfileResolution: VaultSyncDeviceProfileResolution,
): VaultSyncDeviceProfileState {
  if (deviceProfileResolution.action === "use_local") {
    return deviceProfileReview.localState;
  }

  if (deviceProfileResolution.action === "use_remote") {
    return deviceProfileReview.remoteState;
  }

  if (deviceProfileResolution.action === "use_resolved") {
    return deviceProfileResolution.state;
  }

  throw new Error(`Unsupported device profile resolution action.`);
}

function stampDeviceProfileState(
  selectedState: VaultSyncDeviceProfileState,
  localState: VaultSyncDeviceProfileState,
  remoteState: VaultSyncDeviceProfileState,
  deviceId: string,
): VaultSyncDeviceProfileState {
  if (selectedState.kind === "missing") {
    return selectedState;
  }

  const versionVector = stampResolvedVersionVector(
    getOptionalDeviceProfileStateVersionVector(localState),
    getOptionalDeviceProfileStateVersionVector(remoteState),
    deviceId,
  );

  if (selectedState.kind === "device_profile") {
    return {
      kind: "device_profile",
      deviceProfile: {
        ...selectedState.deviceProfile,
        versionVector,
      },
    };
  }

  return {
    kind: "deleted",
    deletedDeviceProfile: {
      ...selectedState.deletedDeviceProfile,
      versionVector,
    },
  };
}

function getOptionalDeviceProfileStateVersionVector(
  state: VaultSyncDeviceProfileState,
): VersionVector | null {
  if (state.kind === "missing") {
    return null;
  }

  if (state.kind === "device_profile") {
    return state.deviceProfile.versionVector;
  }

  return state.deletedDeviceProfile.versionVector;
}
