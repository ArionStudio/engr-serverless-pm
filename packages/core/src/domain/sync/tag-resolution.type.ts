import type { TagId } from "../entry/tag.type";
import type { VaultSyncReviewAction } from "./vault-sync-item-review.type";

export type TagReviewResolution = {
  readonly tagId: TagId;
  readonly action: VaultSyncReviewAction;
};
