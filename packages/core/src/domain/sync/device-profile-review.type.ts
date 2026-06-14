import type { DeletedDeviceProfile, DeviceProfile } from "../device-profile";
import type {
  ReviewableVaultSyncItemRelation,
  VaultSyncReviewAction,
} from "./vault-sync-item-review.type";

export type ReviewableDeviceProfile =
  | {
      deviceProfile: DeviceProfile;
      state: "device_profile";
    }
  | {
      deletedDeviceProfile: DeletedDeviceProfile;
      state: "deleted";
    }
  | {
      state: "missing";
    };

export type DeviceProfileReviewItem = {
  deviceId: string;
  relation: ReviewableVaultSyncItemRelation;
  readonly localDeviceProfile: ReviewableDeviceProfile;
  readonly remoteDeviceProfile: ReviewableDeviceProfile;
  readonly preselectedAction: VaultSyncReviewAction;
};
