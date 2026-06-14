import type { VaultSyncReviewAction } from "./vault-sync-item-review.type";

export type DeviceProfileReviewResolution = {
  readonly deviceId: string;
  readonly action: VaultSyncReviewAction;
};
