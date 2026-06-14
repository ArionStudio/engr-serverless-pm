import type {
  DeletedDeviceProfile,
  DeviceProfile,
} from "../device-profile/device-profile";
import type {
  VaultSyncItemRelation,
  VaultSyncReviewAction,
} from "./vault-sync-item-review.type";

export type VaultSyncDeviceProfileState =
  | { readonly kind: "missing" }
  | { readonly kind: "device_profile"; readonly deviceProfile: DeviceProfile }
  | {
      readonly kind: "deleted";
      readonly deletedDeviceProfile: DeletedDeviceProfile;
    };

export type VaultSyncDeviceProfileReview = {
  readonly kind: "device_profile";
  readonly deviceId: string;
  readonly relation: VaultSyncItemRelation;
  readonly conflict: boolean;
  readonly preselectedAction: VaultSyncReviewAction;
  readonly localState: VaultSyncDeviceProfileState;
  readonly remoteState: VaultSyncDeviceProfileState;
};

export type VaultSyncDeviceProfileResolution =
  | {
      readonly kind: "device_profile";
      readonly deviceId: string;
      readonly action: VaultSyncReviewAction;
    }
  | {
      readonly kind: "device_profile";
      readonly deviceId: string;
      readonly action: "use_resolved";
      readonly state: VaultSyncDeviceProfileState;
    };
