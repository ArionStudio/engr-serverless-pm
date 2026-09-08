import type { DeletedTag, Tag, TagId } from "../entry/tag.type";
import type {
  ReviewableVaultSyncItemRelation,
  VaultSyncReviewAction,
} from "./vault-sync-item-review.type";

export type ReviewableTag =
  | {
      tag: Tag;
      state: "tag";
    }
  | {
      deletedTag: DeletedTag;
      state: "deleted";
    }
  | {
      state: "missing";
    };

export type TagReviewItem = {
  tagId: TagId;
  relation: ReviewableVaultSyncItemRelation;
  readonly localTag: ReviewableTag;
  readonly remoteTag: ReviewableTag;
  readonly preselectedAction: VaultSyncReviewAction;
};
