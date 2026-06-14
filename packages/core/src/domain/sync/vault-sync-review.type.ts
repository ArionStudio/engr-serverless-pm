import type { TrustedDevice } from "../device-trust/trusted-device";
import type { VaultSnapshot } from "../snapshot/vault-snapshot";
import type {
  VaultSyncDeviceProfileResolution,
  VaultSyncDeviceProfileReview,
} from "./vault-sync-device-profile-review.type";
import type {
  VaultSyncEntryResolution,
  VaultSyncEntryReview,
} from "./vault-sync-entry-review.type";
import type {
  VaultSyncTagResolution,
  VaultSyncTagReview,
} from "./vault-sync-tag-review.type";

export type {
  VaultSyncDeviceProfileResolution,
  VaultSyncDeviceProfileReview,
  VaultSyncDeviceProfileState,
} from "./vault-sync-device-profile-review.type";
export type {
  VaultSyncEntryResolution,
  VaultSyncEntryReview,
  VaultSyncEntryState,
} from "./vault-sync-entry-review.type";
export type {
  VaultSyncEntryRelation,
  VaultSyncItemRelation,
  VaultSyncReviewAction,
} from "./vault-sync-item-review.type";
export type {
  VaultSyncTagResolution,
  VaultSyncTagReview,
  VaultSyncTagState,
} from "./vault-sync-tag-review.type";

export type VaultSyncTrustState = {
  readonly trustedDevices: readonly TrustedDevice[];
  readonly keySlots: VaultSnapshot["keySlots"];
};

export type VaultSyncTrustReview = {
  readonly kind: "device_trust";
  readonly localTrustState: VaultSyncTrustState;
  readonly remoteTrustState: VaultSyncTrustState;
  readonly informational: true;
};

export type VaultSyncReview = {
  readonly entryReviews: readonly VaultSyncEntryReview[];
  readonly tagReviews: readonly VaultSyncTagReview[];
  readonly deviceProfileReviews: readonly VaultSyncDeviceProfileReview[];
  readonly trustReview?: VaultSyncTrustReview;
  readonly hasChanges: boolean;
  readonly hasConflicts: boolean;
};

export type VaultSyncResolution = {
  readonly entryResolutions: readonly VaultSyncEntryResolution[];
  readonly tagResolutions: readonly VaultSyncTagResolution[];
  readonly deviceProfileResolutions: readonly VaultSyncDeviceProfileResolution[];
};
