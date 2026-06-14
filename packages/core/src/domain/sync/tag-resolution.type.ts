import type { VaultSyncReviewAction } from "./vault-sync-item-review.type";

export type TagReviewResolution = {
  readonly tagId: number;
  readonly action: VaultSyncReviewAction;
};
