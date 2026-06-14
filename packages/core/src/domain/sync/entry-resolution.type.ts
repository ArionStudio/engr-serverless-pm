import type { VaultSyncReviewAction } from "./vault-sync-item-review.type";

export type EntryReviewResolution = {
  readonly entryId: string;
  readonly action: VaultSyncReviewAction;
};
